package org.example.price.eod;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.LocalDate;

import org.example.common.model.marketdata.MarketDataSource;
import org.example.common.model.marketdata.Quote;
import org.example.price.eod.Close.Origin;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/** The end-of-day closes quotes fall back to (SPEC-0079 AC-6, AC-7). */
class EndOfDayStoreTest {

    @TempDir
    Path dataDir;

    private ListAppender<ILoggingEvent> logs;
    private int files;

    @BeforeEach
    void captureLogs() {
        logs = new ListAppender<>();
        logs.start();
        ((Logger) LoggerFactory.getLogger(EndOfDayStore.class)).addAppender(logs);
    }

    @AfterEach
    void releaseLogs() {
        ((Logger) LoggerFactory.getLogger(EndOfDayStore.class)).detachAppender(logs);
    }

    private void operatorFile(String name, String content) throws Exception {
        Files.createDirectories(dataDir.resolve("eod"));
        Path file = dataDir.resolve("eod").resolve(name);
        Files.writeString(file, content);
        // a distinct modification time, as a later copy would have
        Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(++files)));
    }

    private static Quote live(String symbol, String last, String previousClose, String asOf) {
        return Quote.builder().symbol(symbol).last(new BigDecimal(last))
                .previousClose(previousClose == null ? null : new BigDecimal(previousClose))
                .currency("USD").asOf(asOf).source(MarketDataSource.ALPHA_VANTAGE).build();
    }

    // Review finding: the operator's folder exists from the start, so files can be copied into it.
    @Test
    void createsTheOperatorFolder() {
        new EndOfDayStore(dataDir);

        assertThat(dataDir.resolve("eod")).isDirectory();
    }

    // Review finding: writing the learned closes leaves no temporary files behind.
    @Test
    void recordingLeavesNoTemporaryFiles() throws Exception {
        EndOfDayStore store = new EndOfDayStore(dataDir);
        store.record(live("ORCL", "191.50", "190.00", "2026-11-25"));
        store.record(live("AMZN", "210.05", null, "2026-11-25"));

        try (var files = Files.list(dataDir)) {
            assertThat(files.map(p -> p.getFileName().toString()).filter(n -> n.endsWith(".tmp")).toList()).isEmpty();
        }
    }

    @Test
    void theSeedPricesTheSimulatorsSymbols() {
        EndOfDayStore store = new EndOfDayStore(dataDir);

        Close aapl = store.get("aapl").orElseThrow();
        assertThat(aapl.close()).isEqualByComparingTo("170.00");
        assertThat(aapl.origin()).isEqualTo(Origin.SEED);
        assertThat(store.get("ORCL")).isEmpty();
    }

    @Test
    void loadsOperatorFileSkippingMalformedRows() throws Exception {
        operatorFile("closes.csv", """
                symbol,date,close,previousClose,currency
                ORCL,2026-11-25,191.20,189.90,USD
                BAD1,2026-13-01,1.00
                BAD2,2026-11-25,not-a-number
                ,2026-11-25,1.00
                AMZN,2026-11-25,210.05
                TOO,many,columns,1,USD,extra
                """);

        EndOfDayStore store = new EndOfDayStore(dataDir);

        Close orcl = store.get("ORCL").orElseThrow();
        assertThat(orcl.date()).isEqualTo(LocalDate.parse("2026-11-25"));
        assertThat(orcl.close()).isEqualByComparingTo("191.20");
        assertThat(orcl.previousClose()).isEqualByComparingTo("189.90");
        assertThat(orcl.currency()).isEqualTo("USD");
        assertThat(orcl.origin()).isEqualTo(Origin.FILE);
        assertThat(store.get("AMZN").orElseThrow().previousClose()).isNull();
        assertThat(store.get("BAD1")).isEmpty();
        assertThat(store.get("BAD2")).isEmpty();

        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage)
                .anyMatch(m -> m.contains("closes.csv:3") && m.contains("date"))
                .anyMatch(m -> m.contains("closes.csv:4") && m.contains("close"))
                .anyMatch(m -> m.contains("closes.csv:5") && m.contains("symbol"))
                .anyMatch(m -> m.contains("closes.csv:7") && m.contains("columns"))
                .anyMatch(m -> m.contains("closes.csv") && m.contains("2 rows loaded") && m.contains("4 skipped"));
    }

    @Test
    void aFileWithoutTheHeaderIsSkippedWhole() throws Exception {
        operatorFile("wrong.csv", "ticker,when,price\nORCL,2026-11-25,191.20\n");

        EndOfDayStore store = new EndOfDayStore(dataDir);

        assertThat(store.get("ORCL")).isEmpty();
        assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage)
                .anyMatch(m -> m.contains("wrong.csv") && m.contains("symbol,date,close"));
    }

    @Test
    void mostRecentDateWinsBetweenFileAndLearned() throws Exception {
        operatorFile("a.csv", "symbol,date,close\nORCL,2026-11-20,180.00\nAMZN,2026-11-25,210.00\n");
        operatorFile("b.csv", "symbol,date,close\nORCL,2026-11-24,190.00\n");
        EndOfDayStore store = new EndOfDayStore(dataDir);
        assertThat(store.get("ORCL").orElseThrow().close()).isEqualByComparingTo("190.00");

        store.record(live("ORCL", "191.50", "190.00", "2026-11-25"));
        store.record(live("AMZN", "205.00", null, "2026-11-21")); // older than the file's close

        assertThat(store.get("ORCL").orElseThrow().close()).isEqualByComparingTo("191.50");
        assertThat(store.get("ORCL").orElseThrow().origin()).isEqualTo(Origin.LEARNED);
        assertThat(store.get("AMZN").orElseThrow().close()).isEqualByComparingTo("210.00");
    }

    @Test
    void seedNeverWinsOverOtherOrigins() throws Exception {
        // the seed is dated 2026-11-26; a real close from an earlier day still wins
        operatorFile("closes.csv", "symbol,date,close\nAAPL,2026-11-20,230.00\n");
        EndOfDayStore store = new EndOfDayStore(dataDir);
        assertThat(store.get("AAPL").orElseThrow().close()).isEqualByComparingTo("230.00");

        store.record(live("MSFT", "475.10", "470.00", "2026-11-19"));
        assertThat(store.get("MSFT").orElseThrow().close()).isEqualByComparingTo("475.10");
    }

    @Test
    void learnedCloseSurvivesRestart() {
        EndOfDayStore store = new EndOfDayStore(dataDir);
        store.record(live("ORCL", "191.50", "190.00", "2026-11-25"));

        EndOfDayStore restarted = new EndOfDayStore(dataDir);

        Close orcl = restarted.get("ORCL").orElseThrow();
        assertThat(orcl.close()).isEqualByComparingTo("191.50");
        assertThat(orcl.previousClose()).isEqualByComparingTo("190.00");
        assertThat(orcl.date()).isEqualTo(LocalDate.parse("2026-11-25"));
        assertThat(orcl.origin()).isEqualTo(Origin.LEARNED);
    }

    @Test
    void aQuoteWithoutPriceOrDateIsNotRecorded() {
        EndOfDayStore store = new EndOfDayStore(dataDir);

        store.record(Quote.builder().symbol("ORCL").last(new BigDecimal("1")).source(MarketDataSource.ALPHA_VANTAGE).build());

        assertThat(store.get("ORCL")).isEmpty();
    }

    @Test
    void reloadsWhenFilesChange() throws Exception {
        EndOfDayStore store = new EndOfDayStore(dataDir);
        assertThat(store.get("ORCL")).isEmpty();
        assertThat(store.reloadIfChanged()).isFalse();

        operatorFile("closes.csv", "symbol,date,close\nORCL,2026-11-25,191.20\n");

        assertThat(store.reloadIfChanged()).isTrue();
        assertThat(store.get("ORCL").orElseThrow().close()).isEqualByComparingTo("191.20");
        assertThat(store.reloadIfChanged()).isFalse();

        Files.delete(dataDir.resolve("eod").resolve("closes.csv"));
        assertThat(store.reloadIfChanged()).isTrue();
        assertThat(store.get("ORCL")).isEmpty();
    }
}
