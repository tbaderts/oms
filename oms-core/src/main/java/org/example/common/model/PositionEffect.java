package org.example.common.model;

import lombok.Getter;

@Getter
public enum PositionEffect {
    OPEN('O'),
    CLOSE('C');

    private final char fixValue;

    PositionEffect(char fixValue) {
        this.fixValue = fixValue;
    }
}
