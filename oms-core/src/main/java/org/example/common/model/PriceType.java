package org.example.common.model;

import lombok.Getter;

@Getter
public enum PriceType {
    PERCENTAGE('1'),
    PER_UNIT('2'),
    FIXED_AMOUNT('3'),
    DISCOUNT('4'),
    PREMIUM('5'),
    SPREAD('6'),
    YIELD('9');

    private final char fixValue;

    PriceType(char fixValue) {
        this.fixValue = fixValue;
    }
}
