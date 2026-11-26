package org.example.price.reference;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.example.common.model.marketdata.Instrument;
import org.example.price.MutableClock;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Instrument search from the local list, never the provider (SPEC-0079 AC-1). */
class InstrumentCatalogTest {

    @TempDir
    Path dataDir;

    private final MutableClock clock = new MutableClock(Instant.parse("2026-11-26T10:00:00Z"));

    private static Instrument instrument(String symbol, String name) {
        return Instrument.builder().symbol(symbol).name(name).type("Stock").region("NASDAQ").currency("USD").build();
    }

    private static List<String> symbols(List<Instrument> instruments) {
        return instruments.stream().map(Instrument::getSymbol).toList();
    }

    @Test
    void startsFromTheSeedWhenNoListWasDownloaded() {
        InstrumentCatalog catalog = new InstrumentCatalog(dataDir, clock);

        assertThat(symbols(catalog.search("micro"))).containsExactly("MSFT");
        assertThat(catalog.search("micro").get(0).getName()).isEqualTo("Microsoft Corporation");
        assertThat(catalog.size()).isEqualTo(5);
        assertThat(catalog.age()).isEqualTo(InstrumentCatalog.NEVER_REFRESHED);
    }

    @Test
    void searchRanksSymbolThenNameCaseInsensitive() {
        InstrumentCatalog catalog = new InstrumentCatalog(dataDir, clock);
        catalog.replace(List.of(
                instrument("MSFTX", "Some Fund"),
                instrument("AMS", "Micro Systems"),
                instrument("MS", "Morgan Stanley"),
                instrument("MSFT", "Microsoft Corporation"),
                instrument("ZZZ", "Unrelated")));

        // exact symbol, then symbol prefix, then name containing the query, each alphabetically
        assertThat(symbols(catalog.search("ms"))).containsExactly("MS", "MSFT", "MSFTX", "AMS");
        assertThat(symbols(catalog.search("MICRO"))).containsExactly("AMS", "MSFT");
        assertThat(catalog.search("  ")).isEmpty();
        assertThat(catalog.search("nothing-like-it")).isEmpty();
    }

    @Test
    void answersAtMostTwentyFive() {
        InstrumentCatalog catalog = new InstrumentCatalog(dataDir, clock);
        List<Instrument> many = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            many.add(instrument("A" + i, "Alpha " + i));
        }
        catalog.replace(many);

        assertThat(catalog.search("a")).hasSize(InstrumentCatalog.MAX_RESULTS);
    }

    @Test
    void replaceWritesTheListAndANewCatalogReadsIt() throws Exception {
        InstrumentCatalog catalog = new InstrumentCatalog(dataDir, clock);
        catalog.replace(List.of(instrument("BRK-A", "Berkshire Hathaway, Inc.")));

        assertThat(Files.readString(dataDir.resolve("instruments.csv"))).contains("\"Berkshire Hathaway, Inc.\"");
        InstrumentCatalog reopened = new InstrumentCatalog(dataDir, clock);
        assertThat(symbols(reopened.search("berkshire"))).containsExactly("BRK-A");
        assertThat(reopened.search("brk-a").get(0).getName()).isEqualTo("Berkshire Hathaway, Inc.");
        assertThat(reopened.search("aapl")).isEmpty(); // the downloaded list replaces the seed
        assertThat(Files.list(dataDir).map(p -> p.getFileName().toString()).toList()).containsExactly("instruments.csv");
    }

    @Test
    void ageIsTheTimeSinceTheListWasWritten() {
        InstrumentCatalog catalog = new InstrumentCatalog(dataDir, clock);
        catalog.replace(List.of(instrument("IBM", "IBM")));
        clock.advance(Duration.ofHours(25));

        assertThat(catalog.age()).isEqualTo(Duration.ofHours(25));
        assertThat(new InstrumentCatalog(dataDir, clock).age()).isEqualTo(Duration.ofHours(25));
    }

    @Test
    void searchesTwelveThousandInstrumentsQuickly() {
        InstrumentCatalog catalog = new InstrumentCatalog(dataDir, clock);
        List<Instrument> listing = new ArrayList<>();
        for (int i = 0; i < 12_000; i++) {
            listing.add(instrument("S" + i, "Company number " + i + " Holdings Inc"));
        }
        catalog.replace(listing);
        catalog.search("holdings"); // warm up

        long started = System.nanoTime();
        catalog.search("number 117");
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(50));
    }
}
