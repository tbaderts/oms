package org.example.price.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.example.common.model.marketdata.InstrumentSearchResult;
import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.example.price.MutableClock;
import org.example.price.budget.RequestBudget;
import org.example.price.eod.EndOfDayStore;
import org.example.price.provider.AlphaVantageProvider;
import org.example.price.provider.StubAlphaVantage;
import org.example.price.reference.InstrumentCatalog;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.client.RestClient;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/** Search from the instrument list; quotes live within the budget, else end-of-day (SPEC-0079). */
class PriceServiceTest {

    @TempDir
    Path dataDir;

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-26T10:00:00Z"));
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private StubAlphaVantage alphaVantage;
    private RequestBudget budget;
    private EndOfDayStore store;
    private InstrumentCatalog catalog;

    @BeforeEach
    void setUp() {
        alphaVantage = new StubAlphaVantage();
        alphaVantage.quote("ORCL", "191.50");
        budget = new RequestBudget(25, 5, ZoneOffset.UTC, clock);
        store = new EndOfDayStore(dataDir);
        catalog = new InstrumentCatalog(dataDir, clock);
    }

    @AfterEach
    void tearDown() {
        alphaVantage.close();
    }

    private PriceService service(String key, RequestBudget budget) {
        return new PriceService(
                new AlphaVantageProvider(RestClient.builder(), alphaVantage.baseUrl(), key),
                catalog, store, budget, Duration.ofMinutes(15), clock,
                new PriceMetrics(meters, budget));
    }

    private PriceService service() {
        return service("KEY", budget);
    }

    private double count(String kind, String source, String outcome) {
        var counter = meters.find("oms.price.requests").tags("kind", kind, "source", source, "outcome", outcome).counter();
        return counter == null ? 0 : counter.count();
    }

    // AC-1
    @Test
    void searchAnswersFromTheInstrumentListOnly() {
        InstrumentSearchResult result = service().search("micro");

        assertThat(result.getSource()).isEqualTo(MarketDataSource.REFERENCE_DATA);
        assertThat(result.getInstruments()).extracting("symbol").containsExactly("MSFT");
        assertThat(alphaVantage.requests()).isEmpty();
        assertThat(budget.remainingToday()).isEqualTo(25);
        assertThat(count("search", "REFERENCE_DATA", "FOUND")).isEqualTo(1);
        service().search("nothing-like-it");
        assertThat(count("search", "REFERENCE_DATA", "NOT_FOUND")).isEqualTo(1);
    }

    // AC-3
    @Test
    void aLiveQuoteIsBoughtOnceAndCachedForItsTimeToLive() {
        PriceService service = service();

        Quote first = service.quote("orcl").orElseThrow();
        Quote second = service.quote("ORCL").orElseThrow();

        assertThat(alphaVantage.requestsFor("ORCL")).isEqualTo(1);
        assertThat(first.getSource()).isEqualTo(MarketDataSource.ALPHA_VANTAGE);
        assertThat(second.getLast()).isEqualByComparingTo(first.getLast());
        assertThat(count("quote", "ALPHA_VANTAGE", "PROVIDER")).isEqualTo(1);
        assertThat(count("quote", "ALPHA_VANTAGE", "CACHE")).isEqualTo(1);

        clock.advance(Duration.ofMinutes(16));
        service.quote("ORCL");
        assertThat(alphaVantage.requestsFor("ORCL")).isEqualTo(2);
    }

    // AC-3: concurrent asks for one symbol buy one request
    @Test
    void concurrentAsksForOneSymbolBuyOneRequest() throws Exception {
        PriceService service = service();
        Thread[] threads = new Thread[8];
        for (int i = 0; i < threads.length; i++) {
            threads[i] = new Thread(() -> service.quote("ORCL"));
            threads[i].start();
        }
        for (Thread thread : threads) {
            thread.join();
        }

        assertThat(alphaVantage.requestsFor("ORCL")).isEqualTo(1);
    }

    // AC-4
    @Test
    void aSpentBudgetAnswersTheEndOfDayCloseWithoutAProviderRequest() {
        store.record(Quote.builder().symbol("ORCL").last(new java.math.BigDecimal("190.00"))
                .previousClose(new java.math.BigDecimal("188.00")).currency("USD").asOf("2026-11-24")
                .source(MarketDataSource.ALPHA_VANTAGE).build());
        PriceService service = service("KEY", new RequestBudget(0, 5, ZoneOffset.UTC, clock));

        Quote quote = service.quote("ORCL").orElseThrow();

        assertThat(alphaVantage.requests()).isEmpty();
        assertThat(quote.getSource()).isEqualTo(MarketDataSource.END_OF_DAY);
        assertThat(quote.getLast()).isEqualByComparingTo("190.00");
        assertThat(quote.getPreviousClose()).isEqualByComparingTo("188.00");
        assertThat(quote.getChange()).isEqualByComparingTo("2.00");
        assertThat(quote.getChangePercent()).isEqualByComparingTo("1.0638");
        assertThat(quote.getAsOf()).isEqualTo("2026-11-24");
        assertThat(quote.getCurrency()).isEqualTo("USD");
        assertThat(quote.getNotice()).contains("limit");
        assertThat(count("quote", "END_OF_DAY", "BUDGET_SPENT")).isEqualTo(1);
    }

    // AC-5
    @Test
    void aRateLimitAnswerFallsBackAndStopsAskingUntilTheBudgetResets() {
        alphaVantage.rateLimited(true);
        PriceService service = service();

        Quote quote = service.quote("AAPL").orElseThrow(); // the seed prices AAPL

        assertThat(quote.getSource()).isEqualTo(MarketDataSource.END_OF_DAY);
        assertThat(quote.getLast()).isEqualByComparingTo("170.00");
        assertThat(quote.getNotice()).contains("rate limit");
        assertThat(budget.remainingToday()).isZero();
        service.quote("MSFT");
        service.quote("IBM");
        assertThat(alphaVantage.requests()).hasSize(1);

        alphaVantage.rateLimited(false);
        clock.set(Instant.parse("2026-11-27T00:00:01Z"));
        assertThat(service.quote("ORCL").orElseThrow().getSource()).isEqualTo(MarketDataSource.ALPHA_VANTAGE);
    }

    // AC-7
    @Test
    void aLiveQuoteIsWrittenBackAndUsedWhenTheProviderIsUnavailable() {
        service().quote("ORCL");
        alphaVantage.close(); // unreachable from now on

        Quote quote = service().quote("ORCL").orElseThrow();

        assertThat(quote.getSource()).isEqualTo(MarketDataSource.END_OF_DAY);
        assertThat(quote.getLast()).isEqualByComparingTo("191.50");
        assertThat(quote.getAsOf()).isEqualTo("2026-11-24");
        assertThat(quote.getNotice()).contains("not reachable");
        assertThat(count("quote", "END_OF_DAY", "UNREACHABLE")).isEqualTo(1);
    }

    @Test
    void withoutAKeyQuotesAreEndOfDay() {
        Quote quote = service("", budget).quote("MSFT").orElseThrow();

        assertThat(quote.getSource()).isEqualTo(MarketDataSource.END_OF_DAY);
        assertThat(quote.getNotice()).contains("not configured");
        assertThat(alphaVantage.requests()).isEmpty();
        assertThat(budget.remainingToday()).isEqualTo(25);
    }

    // AC-8
    @Test
    void aSymbolNobodyPricesIsEmpty() {
        PriceService service = service();

        assertThat(service.quote("NOPE")).isEmpty();
        // the provider's "no quote" is cached too: no second request for it
        assertThat(service.quote("NOPE")).isEqualTo(Optional.empty());
        assertThat(alphaVantage.requestsFor("NOPE")).isEqualTo(1);
    }

    // Review finding: one slow provider call must not hold up quotes for other symbols.
    @Test
    void aSlowQuoteForOneSymbolDoesNotHoldUpAnother() throws Exception {
        alphaVantage.quote("SLOW", "10.00");
        alphaVantage.delay("SLOW", 1500);
        PriceService service = service();
        Thread slow = new Thread(() -> service.quote("SLOW"));
        slow.start();
        Thread.sleep(200); // the slow request is in flight

        long started = System.nanoTime();
        Quote orcl = service.quote("ORCL").orElseThrow();
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;
        slow.join();

        assertThat(orcl.getSource()).isEqualTo(MarketDataSource.ALPHA_VANTAGE);
        assertThat(elapsedMs).isLessThan(1000);
    }

    // Review finding: a blank symbol spends no provider request.
    @Test
    void aBlankSymbolIsEmptyWithoutAProviderRequest() {
        assertThat(service().quote("   ")).isEmpty();
        assertThat(alphaVantage.requests()).isEmpty();
    }

    // Review finding: once the full listing is downloaded, a symbol not in it spends no request.
    @Test
    void aSymbolMissingFromTheDownloadedListingSpendsNoRequest() {
        catalog.replace(java.util.List.of(org.example.common.model.marketdata.Instrument.builder()
                .symbol("ORCL").name("Oracle Corporation").build()));
        PriceService service = service();

        assertThat(service.quote("ZZZZ")).isEmpty();
        assertThat(service.quote("AAPL").orElseThrow().getSource()).isEqualTo(MarketDataSource.END_OF_DAY); // the seed close, no request
        assertThat(alphaVantage.requests()).isEmpty();
        assertThat(service.quote("ORCL").orElseThrow().getSource()).isEqualTo(MarketDataSource.ALPHA_VANTAGE);
        assertThat(count("quote", "NONE", "NOT_LISTED")).isEqualTo(1);
    }

    // Review finding: the seed's closes are demo prices, and the answer says so.
    @Test
    void aSeedCloseSaysItIsADemoPrice() {
        Quote quote = service("KEY", new RequestBudget(0, 5, ZoneOffset.UTC, clock)).quote("AAPL").orElseThrow();

        assertThat(quote.getSource()).isEqualTo(MarketDataSource.END_OF_DAY);
        assertThat(quote.getNotice()).contains("demo price");
    }

    @Test
    void aSymbolTheProviderDoesNotQuoteFallsBackToItsClose() {
        Quote quote = service().quote("INTC").orElseThrow(); // stub has no INTC quote; the seed has

        assertThat(quote.getSource()).isEqualTo(MarketDataSource.END_OF_DAY);
        assertThat(quote.getLast()).isEqualByComparingTo("86.96");
        assertThat(count("quote", "END_OF_DAY", "NOT_FOUND")).isEqualTo(1);
    }
}
