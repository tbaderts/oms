package org.example.price.util;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A small in-memory cache whose entries expire after a fixed time (SPEC-0072): enough to keep a
 * free market data quota (about 25 requests a day) from being spent on repeated lookups. Expired
 * entries are dropped when the cache is written to, so it holds at most what was asked for within
 * one time to live.
 */
public final class TtlCache<K, V> {

    private record Entry<V>(V value, Instant expiresAt) {}

    private final Map<K, Entry<V>> entries = new ConcurrentHashMap<>();
    private final Duration timeToLive;
    private final Clock clock;

    public TtlCache(Duration timeToLive, Clock clock) {
        this.timeToLive = timeToLive;
        this.clock = clock;
    }

    /** The value, if it was put less than the time to live ago. */
    public Optional<V> get(K key) {
        Entry<V> entry = entries.get(key);
        if (entry == null || !clock.instant().isBefore(entry.expiresAt())) {
            return Optional.empty();
        }
        return Optional.of(entry.value());
    }

    public void put(K key, V value) {
        Instant now = clock.instant();
        entries.values().removeIf(entry -> !now.isBefore(entry.expiresAt()));
        entries.put(key, new Entry<>(value, now.plus(timeToLive)));
    }

    public int size() {
        return entries.size();
    }
}
