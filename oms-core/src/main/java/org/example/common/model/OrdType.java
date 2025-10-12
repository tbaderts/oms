package org.example.common.model;

import lombok.Getter;

@Getter
public enum OrdType {
    MARKET('1'),
    LIMIT('2'),
    STOP('3'),
    STOP_LIMIT('4'),
    MARKET_ON_CLOSE('5');

    private final char fixValue;

    OrdType(char fixValue) {
        this.fixValue = fixValue;
    }
}
