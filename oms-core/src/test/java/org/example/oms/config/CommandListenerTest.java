package org.example.oms.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.notNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.example.common.model.Order;
import org.example.common.model.cmd.Command;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCancelCmd;
import org.example.common.model.cmd.OrderCancelRejectCmd;
import org.example.common.model.cmd.OrderCancelRequestCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.OrderRejectCmd;
import org.example.common.model.msg.CommandHeader;
import org.example.common.model.msg.QuoteCreateCmd;
import org.example.oms.mapper.CommandHeaderMapper;
import org.example.oms.mapper.OrderMapper;
import org.example.oms.model.CommandSource;
import org.example.oms.service.command.CommandDispatcher;
import org.example.oms.service.commandlog.CommandLogWriter;
import org.example.oms.service.lifecycle.LifecycleAction;
import org.example.oms.service.command.OrderCreateCommandProcessor;
import org.example.oms.service.command.OrderCreateCommandProcessor.OrderCreateResult;
import org.example.oms.service.execution.ExecutionCommandProcessor;
import org.example.oms.service.execution.ExecutionCommandProcessor.ExecutionProcessingResult;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor;
import org.example.oms.service.lifecycle.OrderLifecycleCommandProcessor.OrderLifecycleResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/** Dispatch of bare command records (SPEC-0025): one handler per record, the header on every command. */
@ExtendWith(MockitoExtension.class)
class CommandListenerTest {

    private static final Instant SENT_AT = Instant.parse("2026-11-01T10:15:30.123456Z");

    @Mock private OrderMapper orderMapper;
    @Spy private CommandHeaderMapper commandHeaderMapper = new CommandHeaderMapper();
    @Mock private CommandDecoder commandDecoder;
    @Mock private OrderCreateCommandProcessor orderCreateCommandProcessor;
    @Mock private ExecutionCommandProcessor executionCommandProcessor;
    @Mock private OrderLifecycleCommandProcessor orderLifecycleCommandProcessor;
    @Spy private MeterRegistry meterRegistry = new SimpleMeterRegistry();

    @Mock private CommandLogWriter commandLogWriter;

    private CommandListener commandListener;

    /** The real dispatcher over mocked processors: mapping, routing and counting are exercised together. */
    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        commandListener = new CommandListener(
                orderMapper,
                commandHeaderMapper,
                commandDecoder,
                new CommandDispatcher(
                        orderCreateCommandProcessor, executionCommandProcessor, orderLifecycleCommandProcessor,
                        orderMapper, commandLogWriter, org.mockito.Mockito.mock(jakarta.persistence.EntityManager.class)),
                meterRegistry);
    }

    static CommandHeader header(String commandId) {
        return CommandHeader.newBuilder()
                .setCommandId(commandId)
                .setCorrelationId("ROOT-1")
                .setCausationId("ORD-1:3")
                .setSentAt(SENT_AT)
                .setProducer("oms-exchange-simulator")
                .build();
    }

    /** The header fields every mapped command must carry. */
    private static boolean hasHeader(Command cmd, String type, String commandId) {
        return type.equals(cmd.getType())
                && "1.0.0".equals(cmd.getVersion())
                && commandId.equals(cmd.getCommandId())
                && "ROOT-1".equals(cmd.getCorrelationId())
                && "ORD-1:3".equals(cmd.getCausationId())
                && OffsetDateTime.ofInstant(SENT_AT, ZoneOffset.UTC).equals(cmd.getSentAt());
    }

    @Test
    void orderCreate_isDelegatedWithItsHeader() {
        org.example.common.model.msg.Order avroOrder = new org.example.common.model.msg.Order();
        org.example.common.model.cmd.Order mappedOrder = new org.example.common.model.cmd.Order().clOrdId("C1");
        when(orderMapper.toCmdOrder(avroOrder)).thenReturn(mappedOrder);
        when(orderCreateCommandProcessor.process(any(), any()))
                .thenReturn(OrderCreateResult.builder().success(true).orderId("ORD-1").executionTimeMs(5).build());

        commandListener.handle(new org.example.common.model.msg.OrderCreateCmd(header("c-create"), avroOrder), Instant.now());

        verify(orderCreateCommandProcessor).process(
                argThat(cmd -> cmd instanceof OrderCreateCmd c && hasHeader(c, "OrderCreateCmd", "c-create") && c.getOrder() == mappedOrder),
                notNull());
    }

    /**
     * SPEC-0034 AC-5: the Avro Order keeps sessionId nullable, so the Kafka path still relies on the
     * processor to reject it. That rejection is not a fault: it is acknowledged, not thrown to the DLT.
     */
    @Test
    void rejectedOrderCreate_isAcknowledgedNotThrown() {
        when(orderMapper.toCmdOrder(any(org.example.common.model.msg.Order.class)))
                .thenReturn(new org.example.common.model.cmd.Order().sessionId(null).clOrdId("C1"));
        when(orderCreateCommandProcessor.process(any(), any()))
                .thenReturn(OrderCreateResult.builder().success(false).errorMessage("SessionId is required").build());

        assertDoesNotThrow(() -> commandListener.handle(
                new org.example.common.model.msg.OrderCreateCmd(header("c-1"), new org.example.common.model.msg.Order()), Instant.now()));
    }

    @Test
    void orderAccept_isDelegatedWithItsHeader() {
        when(orderLifecycleCommandProcessor.process(any(), any()))
                .thenReturn(OrderLifecycleResult.builder().success(true).orderId("ORD-2").action(LifecycleAction.ACCEPT).build());

        commandListener.handle(new org.example.common.model.msg.OrderAcceptCmd(header("c-ack"), "ORD-2"), Instant.now());

        verify(orderLifecycleCommandProcessor).process(
                argThat(cmd -> cmd instanceof OrderAcceptCmd c && "ORD-2".equals(c.getOrderId()) && hasHeader(c, "OrderAcceptCmd", "c-ack")),
                notNull());
        // SPEC-0046 AC-3: logged as a Kafka command sent by the header's producer.
        verify(commandLogWriter).applied(
                argThat(cmd -> cmd instanceof OrderAcceptCmd),
                argThat(origin -> origin.source() == CommandSource.KAFKA && "oms-exchange-simulator".equals(origin.principal())),
                eq("ORD-2"),
                any());
        verify(orderCreateCommandProcessor, never()).process(any(), any());
    }

    @Test
    void executionCreate_isDelegatedWithItsHeader() {
        // A real Avro record: converting it with Jackson fails on getSchema(), which is why the
        // listener maps it explicitly.
        org.example.common.model.msg.Execution avroExecution =
                org.example.common.model.msg.Execution.newBuilder().setExecId("EX-1").setOrderId("ORD-1").build();
        org.example.common.model.cmd.Execution mappedExecution =
                new org.example.common.model.cmd.Execution().execId("EX-1").orderId("ORD-1");
        org.example.common.model.Execution execution = mock(org.example.common.model.Execution.class);
        ExecutionProcessingResult result = mock(ExecutionProcessingResult.class);
        org.example.common.model.Execution resultExecution = mock(org.example.common.model.Execution.class);
        Order resultOrder = mock(Order.class);

        when(orderMapper.toCmdExecution(avroExecution)).thenReturn(mappedExecution);
        when(orderMapper.toExecution(mappedExecution)).thenReturn(execution);
        when(executionCommandProcessor.process(eq(execution), any())).thenReturn(result);
        when(result.isSuccess()).thenReturn(true);
        when(result.getExecution()).thenReturn(resultExecution);
        when(resultExecution.getExecId()).thenReturn("EX-1");
        when(result.getOrder()).thenReturn(resultOrder);
        when(resultOrder.getOrderId()).thenReturn("ORD-1");

        commandListener.handle(new org.example.common.model.msg.ExecutionCreateCmd(header("c-fill"), avroExecution), Instant.now());

        verify(executionCommandProcessor).process(
                eq(execution),
                argThat(cmd -> cmd instanceof ExecutionCreateCmd c
                        && hasHeader(c, "ExecutionCreateCmd", "c-fill")
                        && c.getExecution() == mappedExecution));
    }

    @Test
    void eachLifecycleCommand_isDelegatedWithItsFieldsAndHeaderCommandId() {
        when(orderLifecycleCommandProcessor.process(any(), any()))
                .thenReturn(OrderLifecycleResult.builder().success(true).orderId("ORD-5").build());

        commandListener.handle(new org.example.common.model.msg.OrderRejectCmd(header("C-REJ"), "ORD-5", "Unknown symbol"), Instant.now());
        commandListener.handle(new org.example.common.model.msg.OrderCancelCmd(header("C-CXL"), "ORD-5", null), Instant.now());
        commandListener.handle(new org.example.common.model.msg.OrderCancelRequestCmd(header("C-CR"), "ORD-5"), Instant.now());
        commandListener.handle(new org.example.common.model.msg.OrderCancelRejectCmd(header("C-CXLREJ"), "ORD-5", "Unknown order"), Instant.now());

        verify(orderLifecycleCommandProcessor).process(
                argThat(cmd -> cmd instanceof OrderRejectCmd c
                        && "ORD-5".equals(c.getOrderId()) && "Unknown symbol".equals(c.getText()) && hasHeader(c, "OrderRejectCmd", "C-REJ")),
                notNull());
        verify(orderLifecycleCommandProcessor).process(
                argThat(cmd -> cmd instanceof OrderCancelCmd c && "ORD-5".equals(c.getOrderId()) && hasHeader(c, "OrderCancelCmd", "C-CXL")),
                notNull());
        verify(orderLifecycleCommandProcessor).process(
                argThat(cmd -> cmd instanceof OrderCancelRequestCmd c
                        && "ORD-5".equals(c.getOrderId()) && hasHeader(c, "OrderCancelRequestCmd", "C-CR")),
                notNull());
        verify(orderLifecycleCommandProcessor).process(
                argThat(cmd -> cmd instanceof OrderCancelRejectCmd c
                        && "ORD-5".equals(c.getOrderId()) && "Unknown order".equals(c.getText()) && hasHeader(c, "OrderCancelRejectCmd", "C-CXLREJ")),
                notNull());
    }

    // SPEC-0029
    @Test
    void expireAndClose_areDelegatedWithTheirFieldsAndHeader() {
        when(orderLifecycleCommandProcessor.process(any(), any()))
                .thenReturn(OrderLifecycleResult.builder().success(true).orderId("ORD-8").build());

        commandListener.handle(new org.example.common.model.msg.OrderExpireCmd(header("C-EXP"), "ORD-8", "Time in force expired"), Instant.now());
        commandListener.handle(new org.example.common.model.msg.OrderCloseCmd(header("C-CLOSE"), "ORD-8", "End of day"), Instant.now());

        verify(orderLifecycleCommandProcessor).process(
                argThat(cmd -> cmd instanceof org.example.common.model.cmd.OrderExpireCmd c
                        && "ORD-8".equals(c.getOrderId()) && "Time in force expired".equals(c.getText())
                        && hasHeader(c, "OrderExpireCmd", "C-EXP")),
                notNull());
        verify(orderLifecycleCommandProcessor).process(
                argThat(cmd -> cmd instanceof org.example.common.model.cmd.OrderCloseCmd c
                        && "ORD-8".equals(c.getOrderId()) && "End of day".equals(c.getText())
                        && hasHeader(c, "OrderCloseCmd", "C-CLOSE")),
                notNull());
        assertEquals(1.0, consumed("OrderExpireCmd", "applied"));
        assertEquals(1.0, consumed("OrderCloseCmd", "applied"));
    }

    @Test
    void refusedLifecycleCommand_isAcknowledged() {
        when(orderLifecycleCommandProcessor.process(any(), any()))
                .thenReturn(OrderLifecycleResult.builder().success(false).orderId("ORD-6")
                        .errorMessage("CANCEL not allowed for order ORD-6 in state CXL/CXL").build());

        // A duplicate delivery is refused by the processor; returning normally lets the container
        // commit the offset instead of retrying a command that can never succeed.
        assertDoesNotThrow(() -> commandListener.handle(
                new org.example.common.model.msg.OrderCancelCmd(header("C-6"), "ORD-6", null), Instant.now()));
    }

    /**
     * A command type without a handler is a contract problem, not something to shrug off: throwing
     * routes it to the dead-letter topic, with its original bytes (SPEC-0025 AC-4).
     */
    @Test
    void unhandledCommandType_throwsSoItReachesTheDlt() {
        QuoteCreateCmd quote = new QuoteCreateCmd(header("c-q"), new org.example.common.model.msg.Quote());

        assertThrows(IllegalArgumentException.class, () -> commandListener.handle(quote, Instant.now()));

        verify(orderCreateCommandProcessor, never()).process(any(), any());
        verify(orderLifecycleCommandProcessor, never()).process(any(), any());
    }

    @Test
    void consume_decodesTheRecordAndDispatchesIt() {
        byte[] bytes = {0, 0, 0, 0, 1, 2};
        when(commandDecoder.decode("commands", bytes))
                .thenReturn(new org.example.common.model.msg.OrderAcceptCmd(header("c-ack"), "ORD-2"));
        when(orderLifecycleCommandProcessor.process(any(), any()))
                .thenReturn(OrderLifecycleResult.builder().success(true).orderId("ORD-2").action(LifecycleAction.ACCEPT).build());

        commandListener.consume(new ConsumerRecord<>("commands", 0, 0L, "ORD-2", bytes));

        verify(orderLifecycleCommandProcessor).process(argThat(cmd -> cmd instanceof OrderAcceptCmd c && "ORD-2".equals(c.getOrderId())), notNull());
    }

    /** SPEC-0046 AC-6: a duplicate is a refusal: acknowledged, counted refused, never thrown to the DLT. */
    @Test
    void duplicateIsAcknowledgedAndCountedRefused() {
        when(orderLifecycleCommandProcessor.process(any(), any()))
                .thenReturn(OrderLifecycleResult.builder().success(false).duplicate(true).orderId("ORD-9")
                        .errorMessage("Duplicate command C-9 for order ORD-9").build());

        assertDoesNotThrow(() -> commandListener.handle(
                new org.example.common.model.msg.OrderCancelCmd(header("C-9"), "ORD-9", null), Instant.now()));

        assertEquals(1.0, consumed("OrderCancelCmd", "refused"));
        verify(commandLogWriter).refused(any(), any(), eq("ORD-9"), eq("Duplicate command C-9 for order ORD-9"));
    }

    // SPEC-0025 AC-7
    @Test
    void countsAppliedRefusedFailed() {
        when(orderLifecycleCommandProcessor.process(any(), any()))
                .thenReturn(OrderLifecycleResult.builder().success(true).orderId("ORD-7").build())
                .thenReturn(OrderLifecycleResult.builder().success(false).orderId("ORD-7")
                        .errorMessage("Duplicate command C-1").build())
                .thenThrow(new IllegalStateException("database down"));
        when(commandDecoder.decode(eq("commands"), any())).thenThrow(new UndecodableCommandException("not Avro", null));

        commandListener.handle(new org.example.common.model.msg.OrderCancelCmd(header("C-1"), "ORD-7", null), Instant.now());
        commandListener.handle(new org.example.common.model.msg.OrderCancelCmd(header("C-1"), "ORD-7", null), Instant.now());
        assertThrows(IllegalStateException.class, () -> commandListener.handle(
                new org.example.common.model.msg.OrderCancelCmd(header("C-2"), "ORD-7", null), Instant.now()));
        assertThrows(IllegalArgumentException.class, () -> commandListener.handle(
                new QuoteCreateCmd(header("c-q"), new org.example.common.model.msg.Quote()), Instant.now()));
        assertThrows(UndecodableCommandException.class,
                () -> commandListener.consume(new ConsumerRecord<>("commands", 0, 0L, "K", new byte[] {1})));

        assertEquals(1.0, consumed("OrderCancelCmd", "applied"));
        assertEquals(1.0, consumed("OrderCancelCmd", "refused"));
        assertEquals(1.0, consumed("OrderCancelCmd", "failed"));
        assertEquals(1.0, consumed("QuoteCreateCmd", "failed"));
        assertEquals(1.0, consumed("undecodable", "failed"));
    }

    // SPEC-0025 AC-7
    @Test
    void mdcCarriesCommandAndCorrelationId() {
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        Logger logger = (Logger) LoggerFactory.getLogger(CommandListener.class);
        logger.addAppender(logs);
        try {
            when(orderLifecycleCommandProcessor.process(any(), any())).thenAnswer(invocation -> {
                // What a processor logs inside the command's processing carries the ids too.
                assertEquals("c-mdc", MDC.get("commandId"));
                assertEquals("ROOT-1", MDC.get("correlationId"));
                return OrderLifecycleResult.builder().success(true).orderId("ORD-2").action(LifecycleAction.ACCEPT).build();
            });

            commandListener.handle(new org.example.common.model.msg.OrderAcceptCmd(header("c-mdc"), "ORD-2"), Instant.now());
        } finally {
            logger.detachAppender(logs);
        }

        assertTrue(logs.list.size() >= 2, "the listener logged the command and its outcome");
        for (ILoggingEvent event : logs.list) {
            assertEquals("c-mdc", event.getMDCPropertyMap().get("commandId"), event.getFormattedMessage());
            assertEquals("ROOT-1", event.getMDCPropertyMap().get("correlationId"), event.getFormattedMessage());
        }
        assertNull(MDC.get("commandId"), "cleared after the command");
        assertNull(MDC.get("correlationId"), "cleared after the command");
    }

    private double consumed(String type, String outcome) {
        var counter = meterRegistry.find("oms.commands.consumed").tag("type", type).tag("outcome", outcome).counter();
        return counter == null ? 0.0 : counter.count();
    }

    @Test
    void consume_undecodableRecordThrowsWithoutProcessing() {
        byte[] bytes = {42};
        when(commandDecoder.decode("commands", bytes))
                .thenThrow(new UndecodableCommandException("not Avro", new RuntimeException()));

        assertThrows(UndecodableCommandException.class,
                () -> commandListener.consume(new ConsumerRecord<>("commands", 0, 0L, "K", bytes)));

        verify(orderLifecycleCommandProcessor, never()).process(any(), any());
    }
}
