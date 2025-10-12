package org.example.common.model;

import lombok.Getter;

@Getter
public enum TimeInForce {
    DAY('0'),
    GOOD_TILL_CANCEL('1'),
    AT_THE_OPENING('2'),
    IMMEDIATE_OR_CANCEL('3'),
    FILL_OR_KILL('4'),
    GOOD_TILL_CROSSING('5'),
    GOOD_TILL_DATE('6'),
    AT_THE_CLOSE('7');

    private final char fixValue;

    TimeInForce(char fixValue) {
        this.fixValue = fixValue;
    }
}
