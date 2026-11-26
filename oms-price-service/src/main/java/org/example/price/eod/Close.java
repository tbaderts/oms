package org.example.price.eod;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A symbol's closing price on a trading day, and where the store got it (SPEC-0079).
 *
 * @param previousClose the close of the trading day before, when known
 * @param currency when known
 */
public record Close(String symbol, LocalDate date, BigDecimal close, BigDecimal previousClose, String currency, Origin origin) {

    /** Where a close came from; {@link #SEED} never wins over the others. */
    public enum Origin {
        /** The demo prices shipped with the service (the exchange simulator's symbols). */
        SEED,
        /** A file the operator put in {@code <dataDir>/eod/}. */
        FILE,
        /** Written by the service from a live quote. */
        LEARNED
    }
}
