package org.example.mcp.docs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

class FrontMatterTest {

    private static final String DOC = """
            ---
            type: Capability
            title: "Order Capture"
            tags: [orders, capture]
            # a YAML comment, not a heading
            ---
            # Order Capture

            Body text.
            """;

    @Test
    void parsesAndBlanksKeepingLineCount() {
        FrontMatter fm = FrontMatter.parse(DOC);

        assertTrue(fm.present());
        assertEquals("Capability", fm.data().get("type"));
        assertEquals(List.of("orders", "capture"), fm.data().get("tags"));
        assertEquals(6, fm.endLine());

        String blanked = fm.blankedContent();
        assertEquals(DOC.split("\n", -1).length, blanked.split("\n", -1).length);
        assertFalse(blanked.contains("type:"));
        assertFalse(blanked.contains("# a YAML comment"));
        assertTrue(blanked.split("\n", -1)[6].startsWith("# Order Capture"));
    }

    @Test
    void absentFrontMatterLeavesContentUntouched() {
        String plain = "# Title\n\n**Status:** Active\n";
        FrontMatter fm = FrontMatter.parse(plain);

        assertFalse(fm.present());
        assertNull(fm.data());
        assertEquals(0, fm.endLine());
        assertEquals(plain, fm.blankedContent());
    }

    @Test
    void unparseableYamlIsReportedNotThrown() {
        FrontMatter fm = FrontMatter.parse("---\ntags: [unclosed\n---\n# T\n");

        assertTrue(fm.present());
        assertNull(fm.data());
        assertNotNull(fm.error());
        assertFalse(fm.blankedContent().contains("unclosed"));
    }

    @Test
    void nonMappingAndUnclosedBlocks() {
        assertNull(FrontMatter.parse("---\n- a\n- b\n---\n").data());
        FrontMatter unclosed = FrontMatter.parse("---\ntype: X\n# no closing line\n");
        assertFalse(unclosed.present());
        assertTrue(unclosed.blankedContent().contains("type: X"));
    }

    @Test
    void toleratesBomAndCrlf() {
        FrontMatter fm = FrontMatter.parse("﻿---\r\ntype: Domain Concept\r\n---\r\n# T\r\n");

        assertTrue(fm.present());
        assertEquals("Domain Concept", fm.data().get("type"));
        assertEquals(3, fm.endLine());
    }
}
