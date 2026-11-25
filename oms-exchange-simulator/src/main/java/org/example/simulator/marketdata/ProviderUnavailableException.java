package org.example.simulator.marketdata;

/**
 * Alpha Vantage cannot answer now (SPEC-0073). The venue then uses its static reference prices.
 * The message is always one of the fixed texts below, never the provider's own, which can echo the
 * API key; the cause is never kept, because its message can hold the request URL and so the key.
 */
public class ProviderUnavailableException extends RuntimeException {

    public enum Reason {
        NOT_CONFIGURED("Alpha Vantage not configured"),
        RATE_LIMITED("Alpha Vantage rate limit reached"),
        UNREACHABLE("Alpha Vantage not reachable");

        private final String text;

        Reason(String text) {
            this.text = text;
        }
    }

    private final Reason reason;

    public ProviderUnavailableException(Reason reason) {
        super(reason.text);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
