package org.example.oms.integration;

import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.hibernate.resource.jdbc.spi.StatementInspector;

/**
 * Counts the sequence calls Hibernate prepares, per sequence (SPEC-0047). Registered as the session
 * factory's statement inspector by the tests that measure the write set; it never changes the SQL.
 */
public class SqlCounter implements StatementInspector {

    private static final Pattern NEXTVAL = Pattern.compile("nextval\\s*\\(\\s*'([a-z_]+)'");
    private static final Map<String, AtomicLong> NEXTVALS = new ConcurrentHashMap<>();

    @Override
    public String inspect(String sql) {
        Matcher matcher = NEXTVAL.matcher(sql.toLowerCase(Locale.ROOT));
        while (matcher.find()) {
            NEXTVALS.computeIfAbsent(matcher.group(1), k -> new AtomicLong()).incrementAndGet();
        }
        return sql;
    }

    public static void reset() {
        NEXTVALS.clear();
    }

    /** Sequence calls prepared for this sequence since the last reset. */
    public static long nextvals(String sequence) {
        AtomicLong count = NEXTVALS.get(sequence);
        return count == null ? 0 : count.get();
    }

    /** Sequence calls prepared for any sequence since the last reset. */
    public static long nextvals() {
        return NEXTVALS.values().stream().mapToLong(AtomicLong::get).sum();
    }
}
