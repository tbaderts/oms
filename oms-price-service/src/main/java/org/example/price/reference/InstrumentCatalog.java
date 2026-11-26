package org.example.price.reference;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.example.common.model.marketdata.Instrument;
import org.example.price.util.Csv;

import lombok.extern.slf4j.Slf4j;

/**
 * The instrument list instrument search answers from, without asking the provider (SPEC-0079).
 *
 * <p>It is {@code <dataDir>/instruments.csv} once a listing has been downloaded
 * ({@link ReferenceDataRefresher}), else the seed on the classpath ({@code seed/instruments.csv},
 * the exchange simulator's symbols), so search works with no key and no network. The file is
 * {@code symbol,name,type,region,currency} with a header; it is replaced atomically, and its
 * last-modified time is when it was downloaded.
 */
@Slf4j
public class InstrumentCatalog {

    public static final int MAX_RESULTS = 25;
    /** The age of a list that was never downloaded: always due for a refresh. */
    public static final Duration NEVER_REFRESHED = Duration.ofDays(365 * 100);

    static final String FILE = "instruments.csv";
    private static final String SEED = "/seed/instruments.csv";
    private static final String HEADER = "symbol,name,type,region,currency";

    private record Entry(Instrument instrument, String symbol, String name) {}

    private final Path file;
    private final Clock clock;
    private volatile List<Entry> entries;
    private volatile Instant refreshedAt;

    public InstrumentCatalog(Path dataDir, Clock clock) {
        this.file = dataDir.resolve(FILE);
        this.clock = clock;
        load();
    }

    /**
     * Instruments whose symbol or name contains the query, case-insensitively: the exact symbol
     * first, then symbols starting with it, then names containing it, each alphabetically by symbol.
     */
    public List<Instrument> search(String query) {
        String q = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        if (q.isEmpty()) {
            return List.of();
        }
        record Hit(Entry entry, int rank) {}
        List<Hit> hits = new ArrayList<>();
        for (Entry entry : entries) {
            int rank = entry.symbol().equals(q) ? 0
                    : entry.symbol().startsWith(q) ? 1
                    : entry.symbol().contains(q) || entry.name().contains(q) ? 2
                    : -1;
            if (rank >= 0) {
                hits.add(new Hit(entry, rank));
            }
        }
        return hits.stream()
                .sorted(Comparator.comparingInt(Hit::rank).thenComparing(h -> h.entry().symbol()))
                .limit(MAX_RESULTS)
                .map(h -> h.entry().instrument())
                .toList();
    }

    /** Replaces the list, on disk (atomically) and in memory. */
    public synchronized void replace(List<Instrument> instruments) {
        try {
            Files.createDirectories(file.getParent());
            Path temp = Files.createTempFile(file.getParent(), FILE, ".tmp");
            List<String> lines = new ArrayList<>(instruments.size() + 1);
            lines.add(HEADER);
            for (Instrument i : instruments) {
                lines.add(Csv.join(i.getSymbol(), i.getName(), i.getType(), i.getRegion(), i.getCurrency()));
            }
            Instant now = clock.instant();
            try {
                Files.write(temp, lines, StandardCharsets.UTF_8);
                Files.setLastModifiedTime(temp, FileTime.from(now));
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(temp);
            }
            entries = index(instruments);
            refreshedAt = now;
            log.info("Instrument list replaced: {} instruments", instruments.size());
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write " + file, e);
        }
    }

    /** How long ago the list was downloaded; {@link #NEVER_REFRESHED} while only the seed is used. */
    public Duration age() {
        Instant at = refreshedAt;
        return at == null ? NEVER_REFRESHED : Duration.between(at, clock.instant());
    }

    public int size() {
        return entries.size();
    }

    /** Whether the list is a downloaded listing, not the seed: only then is "not listed" meaningful. */
    public boolean isDownloaded() {
        return refreshedAt != null;
    }

    /** Whether the list has this symbol (case-insensitive). */
    public boolean contains(String symbol) {
        String key = symbol.strip().toLowerCase(Locale.ROOT);
        return entries.stream().anyMatch(e -> e.symbol().equals(key));
    }

    private void load() {
        if (Files.isRegularFile(file)) {
            try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                entries = index(read(reader));
                refreshedAt = Files.getLastModifiedTime(file).toInstant();
                log.info("Instrument list: {} instruments from {}", entries.size(), file);
                return;
            } catch (IOException | RuntimeException e) {
                log.warn("Could not read {} ({}); using the seed", file, e.getClass().getSimpleName());
            }
        }
        try (InputStream in = InstrumentCatalog.class.getResourceAsStream(SEED)) {
            if (in == null) {
                throw new IllegalStateException("The seed " + SEED + " is missing");
            }
            entries = index(read(new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))));
            refreshedAt = null;
            log.info("Instrument list: {} instruments from the seed", entries.size());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static List<Instrument> read(BufferedReader reader) throws IOException {
        List<Instrument> instruments = new ArrayList<>();
        String line = reader.readLine(); // header
        while ((line = reader.readLine()) != null) {
            List<String> f = Csv.split(line);
            if (f.isEmpty() || f.get(0).isBlank()) {
                continue;
            }
            instruments.add(Instrument.builder()
                    .symbol(f.get(0).strip())
                    .name(field(f, 1))
                    .type(field(f, 2))
                    .region(field(f, 3))
                    .currency(field(f, 4))
                    .build());
        }
        return instruments;
    }

    private static String field(List<String> fields, int index) {
        return index < fields.size() && !fields.get(index).isBlank() ? fields.get(index).strip() : null;
    }

    private static List<Entry> index(List<Instrument> instruments) {
        return instruments.stream()
                .map(i -> new Entry(i,
                        i.getSymbol().toLowerCase(Locale.ROOT),
                        i.getName() == null ? "" : i.getName().toLowerCase(Locale.ROOT)))
                .toList();
    }
}
