package org.example.price.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.example.price.MutableClock;
import org.example.price.budget.RequestBudget;
import org.example.price.provider.StubAlphaVantage;
import org.example.price.reference.ReferenceDataRefresher;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.client.RestClient;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * The price service over HTTP against a stand-in for Alpha Vantage (SPEC-0079 AC-1, AC-3 to AC-5,
 * AC-7, AC-8, AC-11, AC-13). One context for all tests: each starts on a new day (a fresh budget,
 * an expired cache) and uses its own symbols, so learned closes from one do not affect another.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PriceServiceApiTest {

    private static final String KEY = "TEST-KEY-7f3a9c";
    private static final StubAlphaVantage ALPHA_VANTAGE = new StubAlphaVantage();
    private static final MutableClock CLOCK = new MutableClock(Instant.parse("2026-11-26T10:00:00Z"));
    private static final Path DATA_DIR;

    static {
        try {
            DATA_DIR = Files.createTempDirectory("price-service-api");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        ALPHA_VANTAGE.quote("ORCL", "191.50");
        ALPHA_VANTAGE.quote("AMZN", "210.05");
        ALPHA_VANTAGE.quote("META", "580.00");
        ALPHA_VANTAGE.quote("TSLA", "330.10");
        // Every symbol these tests quote, so the listing that keyAppearsInNoResponseOrLogLine downloads
        // leaves the other tests unchanged whatever order they run in.
        ALPHA_VANTAGE.listing(
                "ORCL,Oracle Corporation,NYSE,Stock,1986-03-12,null,Active",
                "MSFT,Microsoft Corporation,NASDAQ,Stock,1986-03-13,null,Active",
                "AAPL,Apple Inc,NASDAQ,Stock,1980-12-12,null,Active",
                "IBM,International Business Machines Corp,NYSE,Stock,1962-01-02,null,Active",
                "INTC,Intel Corp,NASDAQ,Stock,1971-10-13,null,Active",
                "AMZN,Amazon.com Inc,NASDAQ,Stock,1997-05-15,null,Active",
                "META,Meta Platforms Inc,NASDAQ,Stock,2012-05-18,null,Active",
                "TSLA,Tesla Inc,NASDAQ,Stock,2010-06-29,null,Active");
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("oms.price.alpha-vantage.api-key", () -> KEY);
        registry.add("oms.price.alpha-vantage.base-url", ALPHA_VANTAGE::baseUrl);
        registry.add("oms.price.data-dir", DATA_DIR::toString);
        registry.add("oms.price.reference.scheduled", () -> "false");
    }

    @TestConfiguration
    static class TestClock {
        @Bean
        @Primary
        Clock testClock() {
            return CLOCK;
        }
    }

    @AfterAll
    static void stopStub() {
        ALPHA_VANTAGE.close();
    }

    @LocalServerPort
    int port;

    @Autowired
    RequestBudget budget;

    @Autowired
    ReferenceDataRefresher refresher;

    private ListAppender<ILoggingEvent> logs;

    private record Answer(int status, String body) {}

    private Answer get(String path) {
        return RestClient.create().get().uri("http://localhost:" + port + path)
                .exchange((request, response) -> new Answer(response.getStatusCode().value(),
                        new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8)));
    }

    @BeforeEach
    void newDay() {
        CLOCK.advance(Duration.ofDays(1));
        ALPHA_VANTAGE.reset();
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME)).addAppender(logs);
    }

    @AfterEach
    void stopLogs() {
        ((Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME)).detachAppender(logs);
    }

    // AC-1
    @Test
    void searchAnswersFromReferenceDataWithoutProviderRequests() {
        Answer answer = get("/api/market-data/instruments?query=micro");

        assertThat(answer.status()).isEqualTo(200);
        assertThat(answer.body()).contains("\"symbol\":\"MSFT\"").contains("\"source\":\"REFERENCE_DATA\"");
        assertThat(ALPHA_VANTAGE.requests()).isEmpty();
    }

    // AC-3
    @Test
    void secondQuoteWithinTtlIsServedFromCache() {
        Answer first = get("/api/market-data/quotes/ORCL");
        CLOCK.advance(Duration.ofMinutes(5));
        Answer second = get("/api/market-data/quotes/ORCL");

        assertThat(ALPHA_VANTAGE.requestsFor("ORCL")).isEqualTo(1);
        assertThat(first.body()).contains("\"source\":\"ALPHA_VANTAGE\"").contains("\"last\":191.50");
        assertThat(second.body()).isEqualTo(first.body());
    }

    // AC-4
    @Test
    void spentBudgetAnswersEndOfDayWithoutProviderRequest() {
        budget.exhaust();

        Answer answer = get("/api/market-data/quotes/AAPL");

        assertThat(ALPHA_VANTAGE.requests()).isEmpty();
        assertThat(answer.status()).isEqualTo(200);
        assertThat(answer.body()).contains("\"source\":\"END_OF_DAY\"").contains("\"last\":170.00")
                .contains("\"asOf\":\"2026-11-26\"").contains("limit reached");
    }

    // AC-5
    @Test
    void rateLimitedAnswerFallsBackAndStopsCallingUntilReset() {
        ALPHA_VANTAGE.rateLimited(true);

        Answer answer = get("/api/market-data/quotes/MSFT");
        get("/api/market-data/quotes/IBM");

        assertThat(answer.body()).contains("\"source\":\"END_OF_DAY\"").contains("\"last\":420.00").contains("rate limit");
        assertThat(ALPHA_VANTAGE.requests()).hasSize(1);
        assertThat(budget.remainingToday()).isZero();
    }

    // AC-7
    @Test
    void liveQuoteIsWrittenBackAndUsedWhenProviderUnavailable() {
        get("/api/market-data/quotes/AMZN");
        budget.exhaust();
        CLOCK.advance(Duration.ofMinutes(16)); // the cached live quote has expired

        Answer answer = get("/api/market-data/quotes/AMZN");

        assertThat(answer.body()).contains("\"source\":\"END_OF_DAY\"").contains("\"last\":210.05")
                .contains("\"asOf\":\"2026-11-24\"");
        assertThat(DATA_DIR.resolve("learned-closes.csv")).content().contains("AMZN,2026-11-24,210.05");
    }

    // AC-8
    @Test
    void unknownSymbolIs404Problem() {
        Answer answer = get("/api/market-data/quotes/NOPE");

        assertThat(answer.status()).isEqualTo(404);
        assertThat(answer.body()).contains("urn:oms:error:not-found");
    }

    // AC-8
    @Test
    void invalidQueryIs400Problem() {
        Answer answer = get("/api/market-data/instruments?query=" + "x".repeat(41));

        assertThat(answer.status()).isEqualTo(400);
        assertThat(answer.body()).contains("urn:oms:error:validation-failed");
        assertThat(ALPHA_VANTAGE.requests()).isEmpty();
    }

    // AC-11
    @Test
    void keyAppearsInNoResponseOrLogLine() {
        List<String> bodies = new ArrayList<>();
        bodies.add(get("/api/market-data/instruments?query=or").body());
        bodies.add(get("/api/market-data/quotes/META").body());
        refresher.refresh(); // the list is the seed: due, one LISTING_STATUS
        bodies.add(get("/api/market-data/instruments?query=oracle").body());
        ALPHA_VANTAGE.rateLimited(true);
        bodies.add(get("/api/market-data/quotes/TSLA").body());
        bodies.add(get("/api/market-data/quotes/NOPE2").body());
        bodies.add(get("/actuator/prometheus").body());
        bodies.add(get("/actuator/health").body());

        assertThat(ALPHA_VANTAGE.requestsForFunction("LISTING_STATUS")).isEqualTo(1);
        assertThat(bodies.get(2)).contains("ORCL");
        assertThat(bodies).noneMatch(body -> body.contains(KEY));
        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage).noneMatch(m -> m.contains(KEY));
    }

    // AC-13
    @Test
    void prometheusShowsBudgetGaugeAndRequestCounts() {
        get("/api/market-data/instruments?query=micro");
        get("/api/market-data/quotes/ORCL"); // live
        budget.exhaust();
        get("/api/market-data/quotes/INTC"); // end-of-day

        String metrics = get("/actuator/prometheus").body();

        assertThat(metrics).contains("oms_price_provider_budget_remaining 0.0");
        assertThat(metrics).containsPattern("oms_price_requests_total\\{[^}]*kind=\"search\"[^}]*outcome=\"FOUND\"[^}]*source=\"REFERENCE_DATA\"");
        assertThat(metrics).containsPattern("oms_price_requests_total\\{[^}]*kind=\"quote\"[^}]*outcome=\"PROVIDER\"[^}]*source=\"ALPHA_VANTAGE\"");
        assertThat(metrics).containsPattern("oms_price_requests_total\\{[^}]*kind=\"quote\"[^}]*outcome=\"BUDGET_SPENT\"[^}]*source=\"END_OF_DAY\"");
    }
}
