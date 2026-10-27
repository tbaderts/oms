package org.example.simulator.metrics;

import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

/**
 * Counts what the venue does, one counter per kind of answer, so a test run or a demo can be read
 * off Grafana: how many orders arrived, and how many were acked, filled, rejected or cancelled.
 * Each counter is incremented only after the answer has actually been sent.
 */
@Component
public class SimulatorMetrics {

    private final Counter ordersReceived;
    private final Counter acks;
    private final Counter executions;
    private final Counter rejects;
    private final Counter cancels;
    private final Counter cancelRejects;

    public SimulatorMetrics(MeterRegistry registry) {
        ordersReceived = counter(registry, "simulator.orders.received", "New orders received from the OMS");
        acks = counter(registry, "simulator.acks", "Orders acknowledged (ExecType=0)");
        executions = counter(registry, "simulator.executions", "Executions sent (ExecType=F)");
        rejects = counter(registry, "simulator.rejects", "Orders rejected (ExecType=8)");
        cancels = counter(registry, "simulator.cancels", "Orders cancelled (ExecType=4)");
        cancelRejects = counter(registry, "simulator.cancel.rejects", "Cancel requests refused (35=9)");
    }

    private static Counter counter(MeterRegistry registry, String name, String description) {
        return Counter.builder(name).description(description).register(registry);
    }

    public void orderReceived() {
        ordersReceived.increment();
    }

    public void ack() {
        acks.increment();
    }

    public void execution() {
        executions.increment();
    }

    public void reject() {
        rejects.increment();
    }

    public void cancel() {
        cancels.increment();
    }

    public void cancelReject() {
        cancelRejects.increment();
    }
}
