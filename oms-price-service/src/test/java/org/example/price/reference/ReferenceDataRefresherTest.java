package org.example.price.reference;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.example.price.MutableClock;
import org.example.price.budget.RequestBudget;
import org.example.price.provider.AlphaVantageProvider;
import org.example.price.provider.StubAlphaVantage;
import org.example.price.service.PriceMetrics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.client.RestClient;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/** The instrument list is refreshed with one LISTING_STATUS request a day, never at search time (SPEC-0079 AC-2). */
class ReferenceDataRefresherTest {

    @TempDir
    Path dataDir;

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-26T10:00:00Z"));
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private StubAlphaVantage alphaVantage;
    private InstrumentCatalog catalog;
    private RequestBudget budget;
    private ReferenceDataRefresher refresher;

    @BeforeEach
    void setUp() {
        alphaVantage = new StubAlphaVantage();
        alphaVantage.listing("ORCL,Oracle Corporation,NYSE,Stock,1986-03-12,null,Active",
                "MSFT,Microsoft Corporation,NASDAQ,Stock,1986-03-13,null,Active");
        catalog = new InstrumentCatalog(dataDir, clock);
        budget = new RequestBudget(25, 5, ZoneOffset.UTC, clock);
        refresher = new ReferenceDataRefresher(
                new AlphaVantageProvider(RestClient.builder(), alphaVantage.baseUrl(), "KEY"),
                catalog, budget, Duration.ofDays(1), new PriceMetrics(meters, budget));
    }

    @AfterEach
    void tearDown() {
        alphaVantage.close();
    }

    private double refreshes(String outcome) {
        var counter = meters.find("oms.price.requests").tags("kind", "refresh", "outcome", outcome).counter();
        return counter == null ? 0 : counter.count();
    }

    @Test
    void refreshesOnceWhenListIsOlderThanInterval() {
        refresher.refresh(); // only the seed: due

        assertThat(alphaVantage.requestsForFunction("LISTING_STATUS")).isEqualTo(1);
        assertThat(catalog.search("oracle")).extracting("symbol").containsExactly("ORCL");
        assertThat(catalog.search("aapl")).isEmpty();
        assertThat(budget.remainingToday()).isEqualTo(24);
        assertThat(refreshes("PROVIDER")).isEqualTo(1);

        clock.advance(Duration.ofHours(23));
        refresher.refresh();
        assertThat(alphaVantage.requestsForFunction("LISTING_STATUS")).isEqualTo(1);

        clock.advance(Duration.ofHours(2));
        refresher.refresh();
        assertThat(alphaVantage.requestsForFunction("LISTING_STATUS")).isEqualTo(2);
    }

    @Test
    void skipsWhenListIsFresh() {
        refresher.refresh();
        clock.advance(Duration.ofHours(1));

        refresher.refresh();

        assertThat(alphaVantage.requestsForFunction("LISTING_STATUS")).isEqualTo(1);
    }

    @Test
    void keepsListWhenProviderFailsOrIsRateLimited() {
        alphaVantage.rateLimited(true);

        refresher.refresh();

        assertThat(alphaVantage.requestsForFunction("LISTING_STATUS")).isEqualTo(1);
        assertThat(catalog.search("micro")).extracting("symbol").containsExactly("MSFT"); // the seed, still
        assertThat(budget.remainingToday()).isZero(); // the refusal spends the day
        assertThat(refreshes("RATE_LIMITED")).isEqualTo(1);

        // unreachable: the list stays too
        alphaVantage.close();
        clock.set(Instant.parse("2026-11-27T10:00:00Z"));
        refresher.refresh();
        assertThat(catalog.search("micro")).extracting("symbol").containsExactly("MSFT");
        assertThat(refreshes("UNREACHABLE")).isEqualTo(1);
    }

    // Review finding: a list that cannot be written is counted, not thrown out of the scheduled job.
    @Test
    void aListThatCannotBeWrittenIsKeptAndCounted() throws Exception {
        Path notADirectory = java.nio.file.Files.writeString(dataDir.resolve("blocked"), "a file, not a directory");
        InstrumentCatalog unwritable = new InstrumentCatalog(notADirectory, clock);
        ReferenceDataRefresher failing = new ReferenceDataRefresher(
                new AlphaVantageProvider(RestClient.builder(), alphaVantage.baseUrl(), "KEY"),
                unwritable, budget, Duration.ofDays(1), new PriceMetrics(meters, budget));

        failing.refresh();

        assertThat(unwritable.search("micro")).extracting("symbol").containsExactly("MSFT"); // still the seed
        assertThat(refreshes("FAILED")).isEqualTo(1);
    }

    @Test
    void waitsForBudget() {
        RequestBudget spent = new RequestBudget(0, 5, ZoneOffset.UTC, clock);
        ReferenceDataRefresher noBudget = new ReferenceDataRefresher(
                new AlphaVantageProvider(RestClient.builder(), alphaVantage.baseUrl(), "KEY"),
                catalog, spent, Duration.ofDays(1), new PriceMetrics(meters, spent));

        noBudget.refresh();

        assertThat(alphaVantage.requests()).isEmpty();
        assertThat(refreshes("BUDGET_SPENT")).isEqualTo(1);
    }

    @Test
    void withoutAKeyNothingIsAsked() {
        ReferenceDataRefresher unconfigured = new ReferenceDataRefresher(
                new AlphaVantageProvider(RestClient.builder(), alphaVantage.baseUrl(), ""),
                catalog, budget, Duration.ofDays(1), new PriceMetrics(meters, budget));

        unconfigured.refresh();

        assertThat(alphaVantage.requests()).isEmpty();
        assertThat(budget.remainingToday()).isEqualTo(25);
    }
}
