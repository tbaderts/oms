package org.example.oms.service;

import java.util.Arrays;

import org.example.common.model.ExecutionStatus;
import org.example.oms.model.Event;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * What each execution lifecycle event does to its execution (SPEC-0044): the status it leaves the
 * execution in and the FIX ExecType of the OrderExecution record that tells consumers about it.
 */
@Getter
@RequiredArgsConstructor
enum ExecutionLifecycleEffect {

    /** The venue broke the trade: it no longer counts. ExecType H, trade cancel. */
    BUST(Event.EXEC_BUST, ExecutionStatus.BUSTED, "H"),

    /** The venue corrected the trade; the replacing fill is a new execution. ExecType G, trade correct. */
    CORRECT(Event.EXEC_CORRECT, ExecutionStatus.CORRECTED, "G"),

    /** An operator cancelled the execution manually; for consumers it is a trade cancel. */
    WHACK(Event.EXEC_WHACK, ExecutionStatus.BUSTED, "H");

    private final Event event;
    private final ExecutionStatus resultingStatus;
    private final String execType;

    /** The effect of an event, which must be one of the execution lifecycle events. */
    static ExecutionLifecycleEffect of(Event event) {
        return Arrays.stream(values())
                .filter(effect -> effect.event == event)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(event + " is not an execution lifecycle event"));
    }
}
