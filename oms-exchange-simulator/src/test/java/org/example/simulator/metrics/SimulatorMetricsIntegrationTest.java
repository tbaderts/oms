package org.example.simulator.metrics;

import static org.example.simulator.engine.TestOrders.limit;
import static org.example.simulator.engine.TestOrders.market;
import static org.example.simulator.engine.TestOrders.order;
import static org.example.simulator.engine.TestOrders.update;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.example.common.model.msg.CancelState;
import org.example.common.model.msg.OrdType;
import org.example.common.model.msg.OrderMessage;
import org.example.common.model.msg.Side;
import org.example.common.model.msg.State;
import org.example.common.model.msg.TimeInForce;
import org.example.simulator.AbstractKafkaIntegrationTest;
import org.example.simulator.engine.ExchangeEngine;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** AC-12: the venue's activity is visible on /actuator/prometheus. */
@SpringBootTest(
        properties = {
            "simulator.order-topic=orders-metrics",
            "simulator.command-topic=commands-metrics",
            "simulator.reference-prices.AAPL=170.00",
            "spring.kafka.consumer.group-id=exchange-simulator-metrics-it",
            "spring.kafka.consumer.auto-offset-reset=earliest"
        })
class SimulatorMetricsIntegrationTest extends AbstractKafkaIntegrationTest {

    @Autowired private ExchangeEngine engine;
    @Autowired private WebApplicationContext context;

    @Test
    void countersExposedOnPrometheusEndpoint() throws Exception {
        String suffix = UUID.randomUUID().toString();
        OrderMessage resting = limit("M-REST-" + suffix, Side.BUY, "100", "165.00");

        engine.onOrderMessage(market("M-FILL-" + suffix, Side.BUY, "100"));
        engine.onOrderMessage(order("M-REJ-" + suffix, "ZZZZ", OrdType.MARKET, Side.BUY, "100", null, TimeInForce.DAY));
        engine.onOrderMessage(resting);
        engine.onOrderMessage(update(resting, State.LIVE, CancelState.PCXL));
        engine.onOrderMessage(update(limit("M-UNK-" + suffix, Side.BUY, "1", "165.00"), State.LIVE, CancelState.PCXL));
        engine.flush();

        String body =
                MockMvcBuilders.webAppContextSetup(context).build()
                        .perform(get("/actuator/prometheus"))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        for (String counter :
                List.of(
                        "simulator_orders_received_total",
                        "simulator_acks_total",
                        "simulator_executions_total",
                        "simulator_rejects_total",
                        "simulator_cancels_total",
                        "simulator_cancel_rejects_total")) {
            assertTrue(value(body, counter) > 0, counter + " should be positive in:\n" + body);
        }
    }

    private static double value(String body, String counter) {
        Matcher matcher = Pattern.compile("(?m)^" + counter + "(?:\\{[^}]*\\})? ([0-9.Ee+-]+)$").matcher(body);
        return matcher.find() ? Double.parseDouble(matcher.group(1)) : -1;
    }
}
