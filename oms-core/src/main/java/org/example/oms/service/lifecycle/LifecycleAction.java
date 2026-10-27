package org.example.oms.service.lifecycle;

import org.example.common.model.CancelState;
import org.example.common.model.State;
import org.example.oms.model.Event;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

/**
 * The lifecycle changes a market or a client can make to an existing order, each named after the
 * FIX message it models.
 *
 * <p>Each constant is one row of the rule table: the state it moves the order to ({@code null} when
 * only the cancel state changes), the cancel state it leaves behind ({@code null} for unchanged), the
 * event it records, whether the open quantity is closed out, and what happens to the order's
 * {@code rejectReason}. The preconditions live in
 * {@code ValidateLifecycleActionTask}, so the whole rule set reads in two places rather than four
 * processors.
 *
 * @see <a href="file:///oms-knowledge-base/oms-concepts/order-lifecycle.md">Order Lifecycle</a>
 */
@Getter
@RequiredArgsConstructor
public enum LifecycleAction {

    /** ExecutionReport ExecType=8: the market refused the order. */
    REJECT(State.REJ, null, Event.REJ, true, ReasonEffect.SET),

    /** ExecutionReport ExecType=4: the market cancelled the open quantity, asked for or not. */
    CANCEL(State.CXL, CancelState.CXL, Event.CXL, true, ReasonEffect.NONE),

    /** OrderCancelRequest (35=F): the client asks for the open quantity to be cancelled. */
    CANCEL_REQUEST(null, CancelState.PCXL, Event.CXL_REQUEST, false, ReasonEffect.CLEAR),

    /** OrderCancelReject (35=9): the market refused the cancel request; the order stays live. */
    CANCEL_REJECT(null, CancelState.REJ, Event.CXL_REJ, false, ReasonEffect.SET);

    private final State targetState;
    private final CancelState resultingCancelState;
    private final Event event;
    private final boolean closesOpenQuantity;
    private final ReasonEffect reasonEffect;

    /**
     * What an action does to the order's {@code rejectReason}, the venue's latest refusal. The
     * client's {@code text} is never touched.
     */
    public enum ReasonEffect {
        /** Store the command's reason: the venue refused something. */
        SET,
        /** Clear it: a new request must not show why an earlier one was refused. */
        CLEAR,
        /** Leave it: a successful cancel is not an error; its reason stays in the event log. */
        NONE
    }
}
