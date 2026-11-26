package org.example.simulator.marketdata;

/**
 * The price service cannot answer now (SPEC-0073, SPEC-0079). The venue then uses its static
 * reference prices. The message is always one of the fixed texts below; the cause is not kept.
 */
public class ProviderUnavailableException extends RuntimeException {

    public enum Reason {
        NOT_CONFIGURED("Price service not configured"),
        UNREACHABLE("Price service not reachable");

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
