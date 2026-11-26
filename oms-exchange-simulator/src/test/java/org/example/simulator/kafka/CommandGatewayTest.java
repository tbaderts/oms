package org.example.simulator.kafka;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.apache.avro.specific.SpecificRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.errors.TopicAuthorizationException;
import org.example.common.model.msg.OrderAcceptCmd;
import org.example.simulator.engine.Cause;
import org.example.simulator.engine.TestProperties;
import org.example.simulator.kafka.errors.DeadLetterMetrics;
import org.example.simulator.kafka.errors.DeadLetters;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.kafka.support.SendResult;

import io.confluent.kafka.serializers.KafkaAvroSerializer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * SPEC-0077 AC-7 for the simulator's command producer: a command that cannot be sent is dead-lettered
 * to {@code commands.oms-exchange-simulator.DLT}, and a dead letter that fails too is counted. The
 * gateway never throws into the engine.
 */
class CommandGatewayTest {

    private static final Cause CAUSE = new Cause("ROOT-1", "ORD-1", 1L);

    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, Object> commands = mock(KafkaTemplate.class);
    private final CommandDeadLetterPublisher deadLetters = mock(CommandDeadLetterPublisher.class);
    private final CommandGateway gateway = new CommandGateway(
            commands, TestProperties.aapl170(1, Duration.ZERO, 100), new CommandHeaders("oms-exchange-simulator"), deadLetters);

    @Test
    void aSentCommandIsNotDeadLettered() throws Exception {
        when(commands.send(anyString(), anyString(), any())).thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));

        gateway.send("ORD-1", new OrderAcceptCmd(new CommandHeaders("x").build(CAUSE, null), "ORD-1")).get(5, TimeUnit.SECONDS);

        verify(deadLetters, never()).deadLetter(any(), any(), any(), any());
    }

    @Test
    void nonRetryableSendDeadLettered() throws Exception {
        when(commands.send(anyString(), anyString(), any()))
                .thenReturn(CompletableFuture.failedFuture(new TopicAuthorizationException("not allowed to write commands")));
        when(deadLetters.deadLetter(any(), any(), any(), any())).thenReturn(CompletableFuture.completedFuture(null));

        gateway.accept(CAUSE, "ORD-1");

        ArgumentCaptor<Throwable> failure = ArgumentCaptor.forClass(Throwable.class);
        verify(deadLetters, org.mockito.Mockito.timeout(2_000)).deadLetter(eq("commands"), eq("ORD-1"), any(OrderAcceptCmd.class), failure.capture());
        assertThat(failure.getValue()).isInstanceOf(TopicAuthorizationException.class);
    }

    @Test
    void aSynchronousSendFailureIsDeadLetteredNotThrown() {
        when(commands.send(anyString(), anyString(), any())).thenThrow(new SerializationException("decimal scale"));
        when(deadLetters.deadLetter(any(), any(), any(), any())).thenReturn(CompletableFuture.completedFuture(null));

        gateway.accept(CAUSE, "ORD-1"); // must not throw into the engine

        // Dead-lettered off the calling thread, so wait for it.
        verify(deadLetters, org.mockito.Mockito.timeout(2_000))
                .deadLetter(eq("commands"), eq("ORD-1"), any(OrderAcceptCmd.class), any(SerializationException.class));
    }

    /** The dead letter is written off the thread that completes the send (the producer's network thread). */
    @Test
    void deadLetteringRunsOffTheCompletingThread() throws Exception {
        CompletableFuture<org.springframework.kafka.support.SendResult<String, Object>> sending = new CompletableFuture<>();
        when(commands.send(anyString(), anyString(), any())).thenReturn(sending);
        java.util.concurrent.atomic.AtomicReference<Thread> ranOn = new java.util.concurrent.atomic.AtomicReference<>();
        when(deadLetters.deadLetter(any(), any(), any(), any())).thenAnswer(invocation -> {
            ranOn.set(Thread.currentThread());
            return CompletableFuture.completedFuture(null);
        });

        CompletableFuture<Void> handled = gateway.send("ORD-1", new OrderAcceptCmd());
        Thread completing = new Thread(() -> sending.completeExceptionally(new TopicAuthorizationException("no write")));
        completing.start();
        completing.join();
        handled.get(2, java.util.concurrent.TimeUnit.SECONDS);

        assertThat(ranOn.get()).isNotNull().isNotSameAs(completing);
    }

    @Test
    void deadLetterCarriesTheAvroBytesAndProducerHeaders() throws Exception {
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, byte[]> dlt = mock(KafkaTemplate.class);
        when(dlt.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));
        KafkaAvroSerializer serializer = mock(KafkaAvroSerializer.class);
        when(serializer.serialize(eq("commands"), any())).thenReturn(new byte[] {0, 0, 0, 0, 7, 42});
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CommandDeadLetterPublisher publisher = new CommandDeadLetterPublisher(
                dlt, serializer, new DeadLetters("oms-exchange-simulator"), new DeadLetterMetrics(registry, "oms-exchange-simulator"));
        SpecificRecord command = new OrderAcceptCmd(new CommandHeaders("x").build(CAUSE, null), "ORD-1");

        publisher.deadLetter("commands", "ORD-1", command, new TopicAuthorizationException("denied")).get(5, TimeUnit.SECONDS);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<ProducerRecord<String, byte[]>> sent = ArgumentCaptor.forClass(ProducerRecord.class);
        verify(dlt).send(sent.capture());
        ProducerRecord<String, byte[]> record = sent.getValue();
        assertThat(record.topic()).isEqualTo("commands.oms-exchange-simulator.DLT");
        assertThat(record.key()).isEqualTo("ORD-1");
        assertThat(record.value()).containsExactly(0, 0, 0, 0, 7, 42);
        assertThat(text(record, KafkaHeaders.DLT_EXCEPTION_FQCN)).isEqualTo(TopicAuthorizationException.class.getName());
        assertThat(text(record, DeadLetters.HEADER_SOURCE)).isEqualTo("producer");
        assertThat(registry.get(DeadLetterMetrics.DEAD_LETTERS).tags(Map.of("side", "producer", "exception", "TopicAuthorizationException")
                .entrySet().stream().flatMap(e -> java.util.stream.Stream.of(e.getKey(), e.getValue())).toArray(String[]::new))
                .counter().count()).isEqualTo(1.0);
    }

    @Test
    void anUnserializableCommandIsDeadLetteredAsJson() throws Exception {
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, byte[]> dlt = mock(KafkaTemplate.class);
        when(dlt.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));
        KafkaAvroSerializer serializer = mock(KafkaAvroSerializer.class);
        when(serializer.serialize(eq("commands"), any())).thenThrow(new SerializationException("scale"));
        CommandDeadLetterPublisher publisher = new CommandDeadLetterPublisher(
                dlt, serializer, new DeadLetters("oms-exchange-simulator"), new DeadLetterMetrics(new SimpleMeterRegistry(), "oms-exchange-simulator"));

        publisher.deadLetter("commands", "ORD-1", new OrderAcceptCmd(new CommandHeaders("x").build(CAUSE, null), "ORD-1"),
                new SerializationException("scale")).get(5, TimeUnit.SECONDS);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<ProducerRecord<String, byte[]>> sent = ArgumentCaptor.forClass(ProducerRecord.class);
        verify(dlt).send(sent.capture());
        assertThat(new String(sent.getValue().value(), StandardCharsets.UTF_8)).contains("\"orderId\": \"ORD-1\"");
        assertThat(text(sent.getValue(), "content-type")).isEqualTo("application/json");
    }

    @Test
    void deadLetterFailureCountedAndLogged() throws Exception {
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, byte[]> dlt = mock(KafkaTemplate.class);
        when(dlt.send(any(ProducerRecord.class))).thenReturn(CompletableFuture.failedFuture(new TopicAuthorizationException("no DLT either")));
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        CommandDeadLetterPublisher publisher = new CommandDeadLetterPublisher(
                dlt, mock(KafkaAvroSerializer.class), new DeadLetters("oms-exchange-simulator"), new DeadLetterMetrics(registry, "oms-exchange-simulator"));

        publisher.deadLetter("commands", "ORD-1", new OrderAcceptCmd(new CommandHeaders("x").build(CAUSE, null), "ORD-1"),
                new TopicAuthorizationException("denied")).get(5, TimeUnit.SECONDS); // completes, never exceptionally

        assertThat(registry.get(DeadLetterMetrics.DEAD_LETTERS_FAILED).tags("topic", "commands").counter().count()).isEqualTo(1.0);
        assertThat(registry.find(DeadLetterMetrics.DEAD_LETTERS).counter()).isNull();
    }

    private static String text(ProducerRecord<?, ?> record, String key) {
        return new String(record.headers().lastHeader(key).value(), StandardCharsets.UTF_8);
    }
}
