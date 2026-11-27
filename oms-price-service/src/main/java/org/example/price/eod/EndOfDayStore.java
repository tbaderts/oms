package org.example.price.eod;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

import org.example.common.model.marketdata.Quote;
import org.example.price.eod.Close.Origin;
import org.example.price.util.Csv;

import lombok.extern.slf4j.Slf4j;

/**
 * The last known close per symbol, which quotes fall back to when no live price can be had
 * (SPEC-0079). Three sources:
 *
 * <ol>
 *   <li>{@link Origin#SEED}: {@code seed/eod-prices.csv} on the classpath, the exchange simulator's
 *       demo prices; it never wins over the others, whatever its date.
 *   <li>{@link Origin#FILE}: every {@code <dataDir>/eod/*.csv} the operator puts there, e.g. an
 *       export from any end-of-day source; checked for changes by {@code PriceSchedule}.
 *   <li>{@link Origin#LEARNED}: {@code <dataDir>/learned-closes.csv}, written from every live
 *       quote, so the fallback improves with use and survives a restart.
 * </ol>
 *
 * Between files and learned closes the most recent date wins (a learned close on a tie, as it is
 * live data). The format is {@code symbol,date,close[,previousClose[,currency]]} with that header and
 * ISO dates; a malformed row is skipped and logged with its line, the rest of the file is used.
 */
@Slf4j
public class EndOfDayStore {

    static final String EOD_DIR = "eod";
    static final String LEARNED_FILE = "learned-closes.csv";
    private static final String SEED = "/seed/eod-prices.csv";
    private static final String HEADER = "symbol,date,close";

    private final Path dataDir;
    private final Map<String, Close> seed;
    private volatile Map<String, Close> files = Map.of();
    private final Map<String, Close> learned = new HashMap<>();
    private volatile String filesSignature = "";

    public EndOfDayStore(Path dataDir) {
        this.dataDir = dataDir;
        this.seed = readSeed();
        try {
            // The operator copies files here; it exists from the start, e.g. in a fresh volume.
            Files.createDirectories(dataDir.resolve(EOD_DIR));
        } catch (IOException e) {
            log.warn("Could not create {}: {}", dataDir.resolve(EOD_DIR), e.getClass().getSimpleName());
        }
        Path learnedFile = dataDir.resolve(LEARNED_FILE);
        if (Files.isRegularFile(learnedFile)) {
            learned.putAll(readFile(learnedFile, Origin.LEARNED));
        }
        reloadIfChanged();
    }

    /** The close quotes fall back to for this symbol, if any source has one. */
    public Optional<Close> get(String symbol) {
        String key = key(symbol);
        Close file = files.get(key);
        Close live;
        synchronized (learned) {
            live = learned.get(key);
        }
        if (file != null && live != null) {
            return Optional.of(file.date().isAfter(live.date()) ? file : live);
        }
        if (file != null || live != null) {
            return Optional.of(file != null ? file : live);
        }
        return Optional.ofNullable(seed.get(key));
    }

    /**
     * Re-reads the operator's files when one was added, changed or removed.
     *
     * @return whether they were re-read
     */
    public synchronized boolean reloadIfChanged() {
        List<Path> all = operatorFiles();
        String signature = signature(all);
        if (signature.equals(filesSignature)) {
            return false;
        }
        List<Path> paths = all.stream().filter(EndOfDayStore::isCsv).toList();
        // A file that is not read is named, e.g. one copied in as "stooq.csv." with a trailing dot.
        all.stream().filter(p -> !isCsv(p)).forEach(p ->
                log.warn("{}: ignored, only files ending in .csv are read from {}", p.getFileName(), EOD_DIR));
        Map<String, Close> merged = new HashMap<>();
        for (Path path : paths) {
            readFile(path, Origin.FILE).forEach((symbol, close) -> merged.merge(symbol, close,
                    (a, b) -> b.date().isAfter(a.date()) ? b : a));
        }
        files = Map.copyOf(merged);
        filesSignature = signature;
        log.info("End-of-day closes: {} symbols from {} operator file(s), {} learned, {} seed",
                merged.size(), paths.size(), learnedCount(), seed.size());
        return true;
    }

    /** Keeps a live quote's price as the symbol's close of its trading day ({@code asOf}). */
    public void record(Quote quote) {
        if (quote.getSymbol() == null || quote.getLast() == null || quote.getAsOf() == null) {
            return;
        }
        LocalDate date;
        try {
            date = LocalDate.parse(quote.getAsOf());
        } catch (DateTimeParseException e) {
            log.warn("Live quote for {} has an unreadable date {}; not recorded", quote.getSymbol(), quote.getAsOf());
            return;
        }
        Close close = new Close(key(quote.getSymbol()), date, quote.getLast(), quote.getPreviousClose(),
                quote.getCurrency(), Origin.LEARNED);
        synchronized (learned) {
            Close existing = learned.get(close.symbol());
            if (existing != null && existing.date().isAfter(date)) {
                return;
            }
            learned.put(close.symbol(), close);
            writeLearned();
        }
    }

    private void writeLearned() {
        Path file = dataDir.resolve(LEARNED_FILE);
        List<String> lines = new ArrayList<>(learned.size() + 1);
        lines.add("symbol,date,close,previousClose,currency");
        learned.values().stream()
                .sorted((a, b) -> a.symbol().compareTo(b.symbol()))
                .forEach(c -> lines.add(Csv.join(c.symbol(), c.date().toString(), c.close().toPlainString(),
                        c.previousClose() == null ? null : c.previousClose().toPlainString(), c.currency())));
        try {
            Files.createDirectories(dataDir);
            Path temp = Files.createTempFile(dataDir, LEARNED_FILE, ".tmp");
            try {
                Files.write(temp, lines, StandardCharsets.UTF_8);
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException e) {
            // The close stays in memory; it is lost only if the service restarts before the next write.
            log.warn("Could not write {}: {}", file, e.getClass().getSimpleName());
        }
    }

    private int learnedCount() {
        synchronized (learned) {
            return learned.size();
        }
    }

    private List<Path> operatorFiles() {
        Path dir = dataDir.resolve(EOD_DIR);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> listing = Files.list(dir)) {
            return listing.filter(Files::isRegularFile).sorted().toList();
        } catch (IOException e) {
            log.warn("Could not list {}: {}", dir, e.getClass().getSimpleName());
            return List.of();
        }
    }

    private static boolean isCsv(Path path) {
        return path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".csv");
    }

    private static String signature(List<Path> paths) {
        StringBuilder signature = new StringBuilder();
        for (Path path : paths) {
            try {
                signature.append(path.getFileName()).append(':')
                        .append(Files.getLastModifiedTime(path).toMillis()).append(':')
                        .append(Files.size(path)).append(';');
            } catch (IOException e) {
                signature.append(path.getFileName()).append(":?;");
            }
        }
        return signature.toString();
    }

    private static Map<String, Close> readSeed() {
        try (InputStream in = EndOfDayStore.class.getResourceAsStream(SEED)) {
            if (in == null) {
                throw new IllegalStateException("The seed " + SEED + " is missing");
            }
            return Map.copyOf(read("seed", new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)), Origin.SEED));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Map<String, Close> readFile(Path path, Origin origin) {
        try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            return read(path.getFileName().toString(), reader, origin);
        } catch (IOException | UncheckedIOException e) {
            log.warn("Could not read {}: {}", path, e.getClass().getSimpleName());
            return Map.of();
        }
    }

    /** One file's closes; for a symbol listed twice, the most recent date. */
    private static Map<String, Close> read(String name, BufferedReader reader, Origin origin) throws IOException {
        Map<String, Close> closes = new HashMap<>();
        String header = reader.readLine();
        if (header == null || !header.strip().replace("﻿", "").toLowerCase(Locale.ROOT).startsWith(HEADER.toLowerCase(Locale.ROOT))) {
            log.warn("{}: skipped, the first line must be the header {}[,previousClose[,currency]]", name, HEADER);
            return closes;
        }
        int lineNumber = 1;
        int loaded = 0;
        int skipped = 0;
        String line;
        while ((line = reader.readLine()) != null) {
            lineNumber++;
            if (line.isBlank()) {
                continue;
            }
            String problem = null;
            Close close = null;
            List<String> f = Csv.split(line);
            if (f.size() < 3 || f.size() > 5) {
                problem = "expected 3 to 5 columns, found " + f.size();
            } else if (f.get(0).isBlank()) {
                problem = "no symbol";
            } else {
                try {
                    LocalDate date = LocalDate.parse(f.get(1).strip());
                    try {
                        BigDecimal price = new BigDecimal(f.get(2).strip());
                        BigDecimal previous = f.size() > 3 && !f.get(3).isBlank() ? new BigDecimal(f.get(3).strip()) : null;
                        String currency = f.size() > 4 && !f.get(4).isBlank() ? f.get(4).strip() : null;
                        close = new Close(key(f.get(0)), date, price, previous, currency, origin);
                    } catch (NumberFormatException e) {
                        problem = "close or previousClose is not a number";
                    }
                } catch (DateTimeParseException e) {
                    problem = "date is not yyyy-MM-dd";
                }
            }
            if (problem != null) {
                skipped++;
                log.warn("{}:{} skipped: {}", name, lineNumber, problem);
                continue;
            }
            loaded++;
            closes.merge(close.symbol(), close, (a, b) -> b.date().isAfter(a.date()) ? b : a);
        }
        if (origin != Origin.SEED) {
            log.info("{}: {} rows loaded, {} skipped", name, loaded, skipped);
        }
        return closes;
    }

    private static String key(String symbol) {
        return symbol.strip().toUpperCase(Locale.ROOT);
    }
}
