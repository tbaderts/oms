package org.example.oms.config;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.example.common.model.Order;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCreateCmd;
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

import com.fasterxml.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class CommandListenerTest {

    @Mock private ObjectMapper objectMapper;
    @Mock private OrderMapper orderMapper;
    @Mock private OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Mock private OrderAcceptCommandProcessor orderAcceptCommandProcessor;
    @Mock private ExecutionCommandProcessor executionCommandProcessor;

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
        when(orderCreateCommandProcessor.process(mapped)).thenReturn(result);

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(orderCreateCommandProcessor).process(mapped);
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void consume_shouldDelegateOrderAcceptCommand() {
        org.example.common.model.msg.OrderAcceptCmd incoming =
                new org.example.common.model.msg.OrderAcceptCmd("OrderAcceptCmd", "1.0", "ORD-2");
        CommandMessage payload = new CommandMessage(incoming);

        OrderAcceptCmd mapped = new OrderAcceptCmd("ORD-2", "OrderAcceptCmd");
        OrderAcceptResult result = OrderAcceptResult.builder().success(true).orderId("ORD-2").build();

        when(objectMapper.convertValue(incoming, OrderAcceptCmd.class)).thenReturn(mapped);
        when(orderAcceptCommandProcessor.process(mapped)).thenReturn(result);

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(orderAcceptCommandProcessor).process(mapped);
        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void consume_shouldDelegateExecutionCreateCommand() {
        org.example.common.model.msg.ExecutionCreateCmd incoming =
                new org.example.common.model.msg.ExecutionCreateCmd("ExecutionCreateCmd", "1.0", null);
        CommandMessage payload = new CommandMessage(incoming);

        ExecutionCreateCmd mapped = new ExecutionCreateCmd().type("ExecutionCreateCmd");
        org.example.common.model.cmd.Execution mappedExecution =
                org.mockito.Mockito.mock(org.example.common.model.cmd.Execution.class);
        mapped.setExecution(mappedExecution);

        org.example.common.model.Execution execution = org.mockito.Mockito.mock(org.example.common.model.Execution.class);
        ExecutionProcessingResult result = org.mockito.Mockito.mock(ExecutionProcessingResult.class);
        org.example.common.model.Execution resultExecution = org.mockito.Mockito.mock(org.example.common.model.Execution.class);
        Order resultOrder = org.mockito.Mockito.mock(Order.class);

        when(objectMapper.convertValue(incoming, ExecutionCreateCmd.class)).thenReturn(mapped);
        when(orderMapper.toExecution(mappedExecution)).thenReturn(execution);
        when(executionCommandProcessor.process(execution)).thenReturn(result);
        when(result.isSuccess()).thenReturn(true);
        when(result.getExecution()).thenReturn(resultExecution);
        when(resultExecution.getExecID()).thenReturn("EX-1");
        when(result.getOrder()).thenReturn(resultOrder);
        when(resultOrder.getOrderId()).thenReturn("ORD-1");

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(executionCommandProcessor).process(execution);
        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void consume_shouldIgnoreNullCommandPayload() {
        CommandMessage payload = new CommandMessage(null);

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void consume_shouldIgnoreUnsupportedCommandType() {
        Object unsupported = new Object();
        CommandMessage payload = new CommandMessage(unsupported);

        commandListener.consume(MessageBuilder.withPayload(payload).build());

        verify(orderCreateCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
        verify(orderAcceptCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
        verify(executionCommandProcessor, never()).process(org.mockito.ArgumentMatchers.any());
    }
}