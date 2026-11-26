package org.example.price.provider;

/**
 * The market data provider cannot answer now (SPEC-0072, moved here by SPEC-0079). The price service
 * then answers from its end-of-day store and says why; it is never an error for the caller.
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
