package org.example.common.model;

import lombok.Getter;

@Getter
public enum HandlInst {
    AUTO('1'),
    BROKER_INTERVENTION_OK('2'),
    MANUAL('3');

    private final char fixValue;

    HandlInst(char fixValue) {
        this.fixValue = fixValue;
    }
}
