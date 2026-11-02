package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.example.common.model.CancelState;
import org.example.common.model.cmd.Command;
import org.example.common.model.msg.CommandHeader;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.common.model.msg.OrderCancelRequestCmd;
import org.example.common.model.msg.OrderCreateCmd;
import org.example.oms.model.OrderEvent;
import org.example.oms.repository.OrderEventRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * SPEC-0025 AC-3: bare command records over Kafka are applied as before, and each event in the log
 * carries its command's header: commandId, correlationId, causationId and sentAt in the stored
 * command, and commandId in {@code command_id}.
 */
class CommandHeaderIntegrationTest extends AbstractFillFlowIntegrationTest {

    @Autowired OrderEventRepository orderEventRepository;

    @Test
    void headerReachesTheEventLog() throws Exception {
        String clOrdId = "CL-" + UUID.randomUUID();
        CommandHeader create = header("create");
        send(clOrdId, new OrderCreateCmd(create, org.example.common.model.msg.Order.newBuilder()
                .setClOrdId(clOrdId)
                .setSessionId("SES-HDR")
                .setAccount("ACC-HDR")
                .setSymbol("AAPL")
                .setSide(org.example.common.model.msg.Side.BUY)
                .setOrdType(org.example.common.model.msg.OrdType.LIMIT)
                .setPrice(new BigDecimal("170.00000000"))
                .setOrderQty(new BigDecimal("100.00000000"))
                .build()));
        awaitUntil(() -> orderRepository.findAll().stream().anyMatch(o -> clOrdId.equals(o.getClOrdId())), "order created");
        String orderId = orderRepository.findAll().stream()
                .filter(o -> clOrdId.equals(o.getClOrdId())).findFirst().orElseThrow().getOrderId();

        CommandHeader accept = header("accept");
        send(orderId, new OrderAcceptCmd(accept, orderId));
        CommandHeader fill = header("fill");
        org.example.common.model.msg.ExecutionCreateCmd partial = fill(orderId + "-F1", orderId, "40");
        partial.setHeader(fill);
        send(orderId, partial);
        CommandHeader cancelRequest = header("cancel-request");
        send(orderId, new OrderCancelRequestCmd(cancelRequest, orderId));

        awaitUntil(() -> orderRepository.findByOrderId(orderId)
                        .map(o -> o.getCancelState() == CancelState.PCXL)
                        .orElse(false),
                orderId + " pending cancel");
        var order = orderRepository.findByOrderId(orderId).orElseThrow();
        assertEquals(0, new BigDecimal("40").compareTo(order.getCumQty()), "the fill applied");

        List<OrderEvent> events = orderEventRepository.findByOrderIdOrderByVersionAsc(orderId);
        List<CommandHeader> headers = List.of(create, accept, fill, cancelRequest);
        assertEquals(headers.size(), events.size(), "one event per command");
        for (int i = 0; i < headers.size(); i++) {
            CommandHeader header = headers.get(i);
            OrderEvent event = events.get(i);
            Command stored = event.getTransaction();
            String which = "event v" + event.getVersion();
            assertEquals(header.getCommandId(), event.getCommandId(), which + " command_id");
            assertEquals(header.getCommandId(), stored.getCommandId(), which + " commandId");
            assertEquals(header.getCorrelationId(), stored.getCorrelationId(), which + " correlationId");
            assertEquals(header.getCausationId(), stored.getCausationId(), which + " causationId");
            assertEquals(OffsetDateTime.ofInstant(header.getSentAt(), ZoneOffset.UTC).toInstant(),
                    stored.getSentAt().toInstant(), which + " sentAt");
        }
    }

    /** A header whose every field is distinct per command; sentAt at micros, the Avro precision. */
    private static CommandHeader header(String name) {
        return CommandHeader.newBuilder()
                .setCommandId(name + "-" + UUID.randomUUID())
                .setCorrelationId("ROOT-" + name)
                .setCausationId("CAUSE-" + name + ":1")
                .setSentAt(Instant.now().truncatedTo(ChronoUnit.MICROS))
                .setProducer(TestCommands.PRODUCER)
                .build();
    }
}
