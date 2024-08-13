package org.oms.transactions.model;

public enum State {
    UNACK,
    LIVE,
    FILLED,
    CXL,
    REJ,
    CLOSED,
    EXP
}
