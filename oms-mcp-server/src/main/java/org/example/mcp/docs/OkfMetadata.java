package org.example.mcp.docs;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.example.mcp.docs.MarkdownParser.DocMetadata;

/**
 * Open Knowledge Format metadata of a document, derived from its front matter.
 *
 * <p>Documents without front matter keep the metadata of their bold header ({@code **Status:**},
 * {@code **Version:**}), so a bundle that is not OKF yet is served exactly as before.
 *
 * <ul>
 *   <li>{@code status}: the OKF lifecycle value ({@code draft}, {@code stable}, {@code deprecated};
 *       {@code stable} when absent, per OKF §5.4); without front matter, the bold header value.
 *   <li>{@code trustTier}: derived from {@code verified} (OKF §7) — none: {@code unverified}; only
 *       non-human actors: {@code machine-confirmed}; any {@code human:} actor: {@code human-reviewed}.
 *   <li>{@code stale}: {@code now >= stale_after}.
 * </ul>
 *
 * <p>{@code maturity} … {@code capability} are this project's keys for capabilities and requirements
 * (see {@code oms-knowledge-base/okf-conventions.md}); {@code sources} lists each source's resource.
 */
public record OkfMetadata(
        String type,
        String title,
        String description,
        List<String> tags,
        String status,
        String legacyStatus,
        String version,
        String updated,
        String staleAfter,
        boolean stale,
        String trustTier,
        String maturity,
        String id,
        String priority,
        String implementation,
        String capability,
        List<String> sources) {

    public static final String UNVERIFIED = "unverified";
    public static final String MACHINE_CONFIRMED = "machine-confirmed";
    public static final String HUMAN_REVIEWED = "human-reviewed";

    public static OkfMetadata derive(FrontMatter frontMatter, DocMetadata legacy, Instant now) {
        Map<String, Object> fm = frontMatter.data();
        if (fm == null) {
            return new OkfMetadata(null, null, null, List.of(), legacy.status(), legacy.status(),
                    legacy.version(), null, null, false, UNVERIFIED, null, null, null, null, null, List.of());
        }
        String staleAfter = text(fm.get("stale_after"));
        String status = text(fm.get("status"));
        String version = text(fm.get("version"));
        return new OkfMetadata(
                text(fm.get("type")),
                text(fm.get("title")),
                text(fm.get("description")),
                tags(fm.get("tags")),
                status != null ? status : "stable",
                legacy.status(),
                version != null ? version : legacy.version(),
                text(fm.get("updated")),
                staleAfter,
                isStale(staleAfter, now),
                trustTier(fm.get("verified")),
                text(fm.get("maturity")),
                text(fm.get("id")),
                text(fm.get("priority")),
                text(fm.get("implementation")),
                text(fm.get("capability")),
                sources(fm.get("sources")));
    }

    /** The {@code resource} of each {@code sources} entry (OKF §5.1); plain string entries are taken as they are. */
    private static List<String> sources(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream()
                .map(entry -> entry instanceof Map<?, ?> map ? text(map.get("resource")) : text(entry))
                .filter(Objects::nonNull)
                .toList();
    }

    /**
     * Maps a status filter to the OKF vocabulary, accepting the legacy header values
     * ({@code Active}, {@code Complete}, {@code Implementation Complete} → {@code stable};
     * {@code Draft}, {@code Draft for discussion} → {@code draft}).
     */
    public static String normalizeStatus(String status) {
        if (status == null) {
            return null;
        }
        String s = status.strip().toLowerCase(Locale.ROOT);
        return switch (s) {
            case "active", "complete", "implementation complete" -> "stable";
            case "draft for discussion" -> "draft";
            default -> s;
        };
    }

    private static String trustTier(Object verified) {
        List<?> events = verified instanceof List<?> list ? list
                : verified instanceof Map<?, ?> single ? List.of(single) : List.of();
        List<String> actors = events.stream()
                .filter(Map.class::isInstance)
                .map(e -> text(((Map<?, ?>) e).get("by")))
                .filter(Objects::nonNull)
                .toList();
        if (actors.isEmpty()) {
            return UNVERIFIED;
        }
        return actors.stream().anyMatch(a -> a.startsWith("human:")) ? HUMAN_REVIEWED : MACHINE_CONFIRMED;
    }

    private static boolean isStale(String staleAfter, Instant now) {
        if (staleAfter == null) {
            return false;
        }
        Instant at;
        try {
            at = OffsetDateTime.parse(staleAfter).toInstant();
        } catch (DateTimeParseException e) {
            try {
                // a date without time means the start of that day in UTC
                at = LocalDate.parse(staleAfter).atStartOfDay(ZoneOffset.UTC).toInstant();
            } catch (DateTimeParseException notADate) {
                return false;
            }
        }
        return !now.isBefore(at);
    }

    private static List<String> tags(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(OkfMetadata::text).filter(Objects::nonNull).toList();
        }
        String single = text(value);
        return single == null ? List.of() : List.of(single);
    }

    /** SnakeYAML turns unquoted numbers and dates into objects; the metadata keeps their text. */
    private static String text(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Date date) {
            return date.toInstant().toString();
        }
        String s = String.valueOf(value).strip();
        return s.isEmpty() ? null : s;
    }
}
