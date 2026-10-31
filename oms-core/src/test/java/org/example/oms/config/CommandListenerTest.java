package org.example.oms.config;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.example.common.model.Order;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.OrderRejectCmd;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor.OrderLifecycleResult;
import org.example.common.model.msg.CommandMessage;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.example.oms.service.command.OrderAcceptCommandProcessor.OrderAcceptResult;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.command.OrderCreateCommandProcessor.OrderCreateResult;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor.ExecutionProcessingResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.support.MessageBuilder;

import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class CommandListenerTest {

    @Mock private ObjectMapper objectMapper;
    @Mock private OrderMapper orderMapper;
    @Mock private OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Mock private OrderAcceptCommandProcessor orderAcceptCommandProcessor;
    @Mock private ExecutionCommandProcessor executionCommandProcessor;
    @Mock private OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;

    @InjectMocks private CommandListener commandListener;

    @Test
    void consume_shouldDelegateOrderCreateCommand() {
        org.example.common.model.msg.OrderCreateCmd incoming =
                new org.example.common.model.msg.OrderCreateCmd("OrderCreateCmd", "1.0", null);
        CommandMessage payload = new CommandMessage(incoming);

        OrderCreateCmd mapped = new OrderCreateCmd().type("OrderCreateCmd");
        OrderCreateResult result =
                OrderCreateResult.builder().success(true).orderId("ORD-1").executionTimeMs(5).build();

        when(objectMapper.convertValue(incoming, OrderCreateCmd.class)).thenReturn(mapped);
        when(orderCreateCommandProcessor.process(org.mockito.ArgumentMatchers.eq(mapped), org.mockito.ArgumentMatchers.any())).thenReturn(result);

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(orderCreateCommandProcessor).process(org.mockito.ArgumentMatchers.eq(mapped), org.mockito.ArgumentMatchers.notNull());
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void consume_shouldDelegateOrderAcceptCommand() {
        org.example.common.model.msg.OrderAcceptCmd incoming =
                new org.example.common.model.msg.OrderAcceptCmd("OrderAcceptCmd", "1.0", "ORD-2");
        CommandMessage payload = new CommandMessage(incoming);

        OrderAcceptResult result = OrderAcceptResult.builder().success(true).orderId("ORD-2").build();

        when(orderAcceptCommandProcessor.process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn(result);

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(orderAcceptCommandProcessor)
            .process(
                org.mockito.ArgumentMatchers.argThat(
                    cmd ->
                        cmd instanceof OrderAcceptCmd
                            && "ORD-2".equals(cmd.getOrderId())
                            && "OrderAcceptCmd".equals(cmd.getType())),
                org.mockito.ArgumentMatchers.notNull());
        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void consume_shouldDelegateExecutionCreateCommand() {
        // A real Avro record: converting it with Jackson fails on getSchema(), which is why the
        // listener maps it explicitly.
        org.example.common.model.msg.Execution avroExecution =
                org.example.common.model.msg.Execution.newBuilder().setExecId("EX-1").setOrderId("ORD-1").build();
        org.example.common.model.msg.ExecutionCreateCmd incoming =
                new org.example.common.model.msg.ExecutionCreateCmd("ExecutionCreateCmd", "1.0", avroExecution);
        CommandMessage payload = new CommandMessage(incoming);

        org.example.common.model.cmd.Execution mappedExecution =
                new org.example.common.model.cmd.Execution().execId("EX-1").orderId("ORD-1");
        org.example.common.model.Execution execution = org.mockito.Mockito.mock(org.example.common.model.Execution.class);
        ExecutionProcessingResult result = org.mockito.Mockito.mock(ExecutionProcessingResult.class);
        org.example.common.model.Execution resultExecution = org.mockito.Mockito.mock(org.example.common.model.Execution.class);
        Order resultOrder = org.mockito.Mockito.mock(Order.class);

        when(orderMapper.toCmdExecution(avroExecution)).thenReturn(mappedExecution);
        when(orderMapper.toExecution(mappedExecution)).thenReturn(execution);
        when(executionCommandProcessor.process(org.mockito.ArgumentMatchers.eq(execution), org.mockito.ArgumentMatchers.any())).thenReturn(result);
        when(result.isSuccess()).thenReturn(true);
        when(result.getExecution()).thenReturn(resultExecution);
        when(resultExecution.getExecID()).thenReturn("EX-1");
        when(result.getOrder()).thenReturn(resultOrder);
        when(resultOrder.getOrderId()).thenReturn("ORD-1");

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(executionCommandProcessor).process(
                org.mockito.ArgumentMatchers.eq(execution),
                org.mockito.ArgumentMatchers.argThat(cmd -> cmd instanceof ExecutionCreateCmd c
                        && "ExecutionCreateCmd".equals(c.getType())
                        && c.getExecution() == mappedExecution));
        verify(objectMapper, never()).convertValue(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.<Class<Object>>any());
        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    /**
     * SPEC-0034 AC-5: the Avro Order keeps sessionId nullable, so the Kafka path still relies on the
     * processor to reject it. That rejection is not a fault: it is acknowledged, not thrown to the DLT.
     */
    @Test
    void consume_rejectedOrderCreate_isAcknowledgedNotThrown() {
        org.example.common.model.msg.OrderCreateCmd incoming =
                new org.example.common.model.msg.OrderCreateCmd("OrderCreateCmd", "1.0", null);
        OrderCreateCmd mapped = new OrderCreateCmd()
                .type("OrderCreateCmd")
                .order(new org.example.common.model.cmd.Order().sessionId(null).clOrdId("C1"));
        when(objectMapper.convertValue(incoming, OrderCreateCmd.class)).thenReturn(mapped);
        when(orderCreateCommandProcessor.process(org.mockito.ArgumentMatchers.eq(mapped), org.mockito.ArgumentMatchers.any()))
                .thenReturn(OrderCreateResult.builder().success(false).errorMessage("SessionId is required").build());

        commandListener.consume(MessageBuilder.withPayload(new CommandMessage(incoming)).build());

        verify(orderCreateCommandProcessor).process(org.mockito.ArgumentMatchers.eq(mapped), org.mockito.ArgumentMatchers.notNull());
    }

    @Test
    void consume_shouldIgnoreNullCommandPayload() {
        CommandMessage payload = new CommandMessage(null);

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    /**
     * An unknown command type is a contract problem, not something to shrug off. The listener used
     * to log a warning and return, which let the container commit the offset and lose the record;
     * throwing routes it to the dead-letter topic instead.
     */
    @Test
    void consume_shouldRejectUnsupportedCommandTypeSoItReachesTheDlt() {
        CommandMessage payload = new CommandMessage(new Object());
        var message = MessageBuilder.withPayload(payload).build();

        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class, () -> commandListener.consume(message));

        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void consume_shouldDelegateEachLifecycleCommandWithItsFields() {
        when(orderLifecycleCommandProcessor.process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(OrderLifecycleResult.builder().success(true).orderId("ORD-5").build());

        commandListener.consume(MessageBuilder.withPayload(new CommandMessage(
                new org.example.common.model.msg.OrderRejectCmd("OrderRejectCmd", "1.0.0", "ORD-5", "Unknown symbol", "C-REJ"))).build());
        commandListener.consume(MessageBuilder.withPayload(new CommandMessage(
                new org.example.common.model.msg.OrderCancelCmd("OrderCancelCmd", "1.0.0", "ORD-5", null, "C-CXL"))).build());
        commandListener.consume(MessageBuilder.withPayload(new CommandMessage(
                new org.example.common.model.msg.OrderCancelRequestCmd("OrderCancelRequestCmd", "1.0.0", "ORD-5", "C-CR"))).build());
        commandListener.consume(MessageBuilder.withPayload(new CommandMessage(
                new org.example.common.model.msg.OrderCancelRejectCmd("OrderCancelRejectCmd", "1.0.0", "ORD-5", "Unknown order", "C-CXLREJ"))).build());

        verify(orderLifecycleCommandProcessor).process(
                org.mockito.ArgumentMatchers.argThat(cmd -> cmd instanceof OrderRejectCmd c
                        && "ORD-5".equals(c.getOrderId()) && "Unknown symbol".equals(c.getText()) && "C-REJ".equals(c.getCommandId())),
                org.mockito.ArgumentMatchers.notNull());
        verify(orderLifecycleCommandProcessor).process(
                org.mockito.ArgumentMatchers.argThat(cmd -> cmd instanceof OrderCancelCmd c && "ORD-5".equals(c.getOrderId()) && "C-CXL".equals(c.getCommandId())),
                org.mockito.ArgumentMatchers.notNull());
        verify(orderLifecycleCommandProcessor).process(
                org.mockito.ArgumentMatchers.argThat(cmd -> cmd instanceof OrderCancelRequestCmd c && "ORD-5".equals(c.getOrderId()) && "C-CR".equals(c.getCommandId())),
                org.mockito.ArgumentMatchers.notNull());
        verify(orderLifecycleCommandProcessor).process(
                org.mockito.ArgumentMatchers.argThat(cmd -> cmd instanceof OrderCancelRejectCmd c
                        && "ORD-5".equals(c.getOrderId()) && "Unknown order".equals(c.getText()) && "C-CXLREJ".equals(c.getCommandId())),
                org.mockito.ArgumentMatchers.notNull());
    }

    @Test
    void consume_shouldAcknowledgeARefusedLifecycleCommand() {
        when(orderLifecycleCommandProcessor.process(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(OrderLifecycleResult.builder().success(false).orderId("ORD-6")
                        .errorMessage("CANCEL not allowed for order ORD-6 in state CXL/CXL").build());

        // A duplicate delivery is refused by the processor; returning normally lets the container
        // commit the offset instead of retrying a command that can never succeed.
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> commandListener.consume(
                MessageBuilder.withPayload(new CommandMessage(
                        new org.example.common.model.msg.OrderCancelCmd("OrderCancelCmd", "1.0.0", "ORD-6", null, null))).build()));
    }
}
