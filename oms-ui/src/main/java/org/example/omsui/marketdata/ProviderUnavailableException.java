package org.example.omsui.marketdata;

/**
 * The market data provider cannot answer now (SPEC-0072). The service then falls back to the
 * built-in instruments and tells the user why; it is never an error for the user.
 */
public class ProviderUnavailableException extends RuntimeException {

    /** Why, in terms the order entry form can show. */
    public enum Reason {
        NOT_CONFIGURED("Market data provider not configured"),
        RATE_LIMITED("Market data provider rate limit reached"),
        UNREACHABLE("Market data provider not reachable");

        private final String notice;

        Reason(String notice) {
            this.notice = notice;
        }

        public String notice() {
            return notice;
        }
    }

    private final Reason reason;

    public ProviderUnavailableException(Reason reason, Throwable cause) {
        super(reason.notice(), cause);
        this.reason = reason;
    }

    public Reason reason() {
        return reason;
    }
}
