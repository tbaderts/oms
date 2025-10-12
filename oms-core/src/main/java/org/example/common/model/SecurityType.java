package org.example.common.model;

import lombok.Getter;

@Getter
public enum SecurityType {
    CS("Common Stock"),
    FUT("Future"),
    OPT("Option"),
    ETF("Exchange Traded Fund"),
    ETN("Exchange Traded Note"),
    MF("Mutual Fund"),
    CORP("Corporate Bond"),
    ;

    private final String fixValue;

    SecurityType(String fixValue) {
        this.fixValue = fixValue;
    }
}
