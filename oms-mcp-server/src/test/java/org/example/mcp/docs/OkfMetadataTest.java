package org.example.mcp.docs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.List;

import org.example.mcp.docs.MarkdownParser.DocMetadata;
import org.junit.jupiter.api.Test;

class OkfMetadataTest {

    private static final Instant NOW = Instant.parse("2026-10-27T12:00:00Z");
    private static final DocMetadata LEGACY = new DocMetadata("1.0", "Active", "2026-02-14", null);
    private static final DocMetadata NO_LEGACY = new DocMetadata(null, null, null, null);

    private static OkfMetadata derive(String frontMatter, DocMetadata legacy) {
        return OkfMetadata.derive(FrontMatter.parse("---\n" + frontMatter + "\n---\n# T\n"), legacy, NOW);
    }

    @Test
    void derivesFieldsFromFrontMatter() {
        OkfMetadata m = derive("""
                type: Requirement
                title: "Accept new orders"
                description: "Creates orders."
                tags: [functional, order-capture]
                status: draft
                version: "2.0"
                updated: "2026-10-01T00:00:00Z"
                id: FR-001
                priority: must
                implementation: implemented
                capability: /capabilities/order-capture.md
                maturity: implemented""", LEGACY);

        assertEquals("Requirement", m.type());
        assertEquals("Accept new orders", m.title());
        assertEquals("Creates orders.", m.description());
        assertEquals(List.of("functional", "order-capture"), m.tags());
        assertEquals("draft", m.status());
        assertEquals("Active", m.legacyStatus());
        assertEquals("2.0", m.version());
        assertEquals("2026-10-01T00:00:00Z", m.updated());
        assertEquals("FR-001", m.id());
        assertEquals("must", m.priority());
        assertEquals("implemented", m.implementation());
        assertEquals("/capabilities/order-capture.md", m.capability());
        assertEquals("implemented", m.maturity());
        assertEquals("unverified", m.trustTier());
    }

    @Test
    void statusDefaultsToStableAndVersionFallsBackToLegacy() {
        OkfMetadata m = derive("type: Specification", LEGACY);

        assertEquals("stable", m.status());
        assertEquals("1.0", m.version());
    }

    @Test
    void fallsBackToLegacyHeaderWithoutFrontMatter() {
        OkfMetadata m = OkfMetadata.derive(FrontMatter.parse("# T\n\n**Status:** Active\n"), LEGACY, NOW);

        assertNull(m.type());
        assertEquals("Active", m.status());
        assertEquals("Active", m.legacyStatus());
        assertEquals("1.0", m.version());
        assertEquals(List.of(), m.tags());
        assertEquals("unverified", m.trustTier());
        assertFalse(m.stale());
    }

    @Test
    void toleratesUnparseableFrontMatter() {
        OkfMetadata m = OkfMetadata.derive(FrontMatter.parse("---\ntags: [x\n---\n# T\n"), LEGACY, NOW);

        assertNull(m.type());
        assertEquals("Active", m.status());
        assertEquals("unverified", m.trustTier());
    }

    @Test
    void stringifiesNumbersAndDates() {
        OkfMetadata m = derive("type: Specification\nversion: 1.10\nupdated: 2026-02-14\ntags: single\nid: 007", NO_LEGACY);

        // unquoted scalars keep the text as written: no float, date or octal coercion
        assertEquals("1.10", m.version());
        assertEquals("2026-02-14", m.updated());
        assertEquals("007", m.id());
        assertEquals(List.of("single"), m.tags());
    }

    @Test
    void collectsSources() {
        OkfMetadata m = derive("""
                type: X
                sources:
                  - resource: "repo:oms-core/src/main/java/Foo.java"
                    id: foo
                  - resource: /capabilities/order-capture.md
                  - https://example.com/spec
                  - { id: no-resource }""", NO_LEGACY);
        assertEquals(List.of("repo:oms-core/src/main/java/Foo.java", "/capabilities/order-capture.md",
                "https://example.com/spec"), m.sources());
        assertEquals(List.of(), derive("type: X", NO_LEGACY).sources());
        assertEquals(List.of(), OkfMetadata.derive(FrontMatter.parse("# T\n"), LEGACY, NOW).sources());
    }

    @Test
    void onlyTrueAndFalseAreBooleans() {
        // as in tools/okf-check (JSON schema): YAML 1.1 yes/no/on/off stay text
        OkfMetadata m = derive("type: X\ntags: [on, no, yes, off, y, n, true]", NO_LEGACY);
        assertEquals(List.of("on", "no", "yes", "off", "y", "n", "true"), m.tags());
    }

    @Test
    void dateOnlyStaleAfterMeansMidnightUtc() {
        assertTrue(derive("type: X\nstale_after: 2026-10-27", NO_LEGACY).stale());
        assertFalse(derive("type: X\nstale_after: \"2026-10-28\"", NO_LEGACY).stale());
    }

    @Test
    void trustTierFromVerified() {
        assertEquals("unverified", derive("type: X", NO_LEGACY).trustTier());
        assertEquals("machine-confirmed", derive("""
                type: X
                verified:
                  - { by: okf-agent/0.1, at: "2026-10-01T00:00:00Z" }""", NO_LEGACY).trustTier());
        assertEquals("human-reviewed", derive("""
                type: X
                verified:
                  - { by: process:nightly, at: "2026-10-01T00:00:00Z" }
                  - { by: "human:tbaderts", at: "2026-10-02T00:00:00Z" }""", NO_LEGACY).trustTier());
        assertEquals("human-reviewed", derive("""
                type: X
                verified: { by: "human:tbaderts", at: "2026-10-02T00:00:00Z" }""", NO_LEGACY).trustTier());
    }

    @Test
    void staleExactlyFromStaleAfter() {
        assertFalse(derive("type: X\nstale_after: \"2026-10-27T12:00:01Z\"", NO_LEGACY).stale());
        assertTrue(derive("type: X\nstale_after: \"2026-10-27T12:00:00Z\"", NO_LEGACY).stale());
        assertTrue(derive("type: X\nstale_after: \"2026-10-27T13:00:00+02:00\"", NO_LEGACY).stale());
        assertFalse(derive("type: X\nstale_after: \"soon\"", NO_LEGACY).stale());
        assertEquals("2026-10-27T12:00:01Z", derive("type: X\nstale_after: \"2026-10-27T12:00:01Z\"", NO_LEGACY).staleAfter());
    }

    @Test
    void normalizesLegacyStatusValues() {
        assertEquals("stable", OkfMetadata.normalizeStatus("Active"));
        assertEquals("stable", OkfMetadata.normalizeStatus("Complete"));
        assertEquals("stable", OkfMetadata.normalizeStatus("Implementation Complete"));
        assertEquals("draft", OkfMetadata.normalizeStatus("Draft for discussion"));
        assertEquals("draft", OkfMetadata.normalizeStatus(" DRAFT "));
        assertEquals("deprecated", OkfMetadata.normalizeStatus("deprecated"));
        assertNull(OkfMetadata.normalizeStatus(null));
    }
}
