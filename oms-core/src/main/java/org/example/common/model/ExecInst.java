package org.example.common.model;

import lombok.Getter;

@Getter
public enum ExecInst {
    NO_CROSS('A'),
    OK_TO_CROSS('B'),
    MID_PEG('M');

    private final char fixValue;

    ExecInst(char fixValue) {
        this.fixValue = fixValue;
    }
}
