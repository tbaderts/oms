package org.example.common.model;

import lombok.Getter;

@Getter
public enum Side {
    BUY('1'),
    SELL('2'),
    SELL_SHORT('5'),
    SUBSCRIBE('D'),
    REDEEM('E');

    private final char fixValue;

    Side(char fixValue) {
        this.fixValue = fixValue;
    }
}
