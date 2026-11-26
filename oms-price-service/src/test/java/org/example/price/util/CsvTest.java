package org.example.price.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The CSV line splitter for the instrument list, the end-of-day files and LISTING_STATUS (SPEC-0079). */
class CsvTest {

    @Test
    void splitsPlainFields() {
        assertThat(Csv.split("AAPL,2026-11-25,170.50")).containsExactly("AAPL", "2026-11-25", "170.50");
    }

    @Test
    void keepsCommasInsideQuotedFieldsAndUnescapesDoubledQuotes() {
        assertThat(Csv.split("BRK.A,\"Berkshire Hathaway, Inc.\",\"Say \"\"hi\"\"\",NYSE"))
                .containsExactly("BRK.A", "Berkshire Hathaway, Inc.", "Say \"hi\"", "NYSE");
    }

    @Test
    void keepsEmptyAndTrailingEmptyFields() {
        assertThat(Csv.split("A,,null,")).containsExactly("A", "", "null", "");
        assertThat(Csv.split("")).containsExactly("");
    }

    @Test
    void ignoresACarriageReturnAtTheEnd() {
        assertThat(Csv.split("A,B\r")).containsExactly("A", "B");
    }

    @Test
    void quotesFieldsThatNeedIt() {
        assertThat(Csv.join("AAPL", "Apple, Inc.", "say \"hi\"", null)).isEqualTo("AAPL,\"Apple, Inc.\",\"say \"\"hi\"\"\",");
        assertThat(Csv.split(Csv.join("x,y", "z"))).containsExactly("x,y", "z");
    }
}
