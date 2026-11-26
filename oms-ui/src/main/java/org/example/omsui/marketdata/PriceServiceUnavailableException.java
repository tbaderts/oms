package org.example.omsui.marketdata;

/**
 * The price service cannot answer now (SPEC-0079): oms-ui answers 503, and order entry lets the
 * user type the symbol by hand.
 */
public class PriceServiceUnavailableException extends RuntimeException {

    public PriceServiceUnavailableException(Throwable cause) {
        super("Price service unavailable", cause);
    }
}
