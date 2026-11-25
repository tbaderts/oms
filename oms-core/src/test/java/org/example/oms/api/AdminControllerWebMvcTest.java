package org.example.oms.api;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.example.oms.admin.AdminNotFoundException;
import org.example.oms.admin.DeadLetterReader;
import org.example.oms.admin.DeadLetterReader.DeadLetterRecord;
import org.example.oms.admin.DeadLetterReader.DeadLetterTopic;
import org.example.oms.admin.DeadLetterReader.PayloadFormat;
import org.example.oms.admin.DeadLetterUnavailableException;
import org.example.oms.admin.OutboxInspector;
import org.example.oms.admin.OutboxInspector.Entry;
import org.example.oms.admin.OutboxInspector.OutboxState;
import org.example.oms.mapper.AdminDtoMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mapstruct.factory.Mappers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.node.JsonNodeFactory;

/** SPEC-0075: the operator API's paths, answers and errors (AC-3, AC-5, AC-9). */
@ExtendWith(MockitoExtension.class)
class AdminControllerWebMvcTest {

    @Mock OutboxInspector inspector;
    @Mock DeadLetterReader reader;

    private MockMvc mockMvc;

    private static final Instant CREATED = Instant.parse("2026-11-25T09:00:00Z");

    private static Entry entry(long id, OutboxState state) {
        return new Entry(id, state, "ORDER", "oms_orders", "ORD-1", "ORD-1", null, 3, null, CREATED, 10, 10, "boom");
    }

    @BeforeEach
    void setUp() {
        AdminController controller = new AdminController(inspector, reader, Mappers.getMapper(AdminDtoMapper.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void outboxSummary() throws Exception {
        when(inspector.summary()).thenReturn(new OutboxInspector.Summary(2, 1, 3, 10, CREATED, 3600L));

        mockMvc.perform(get("/api/query/admin/outbox/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pending").value(2))
                .andExpect(jsonPath("$.stuck").value(1))
                .andExpect(jsonPath("$.held").value(3))
                .andExpect(jsonPath("$.maxAttempts").value(10))
                .andExpect(jsonPath("$.oldestWaitingAgeSeconds").value(3600))
                .andExpect(jsonPath("$.oldestWaitingCreatedAt").exists());
    }

    @Test
    void outboxMessagesByStateWithPageMetadata() throws Exception {
        when(inspector.page(OutboxState.STUCK, 1, 2)).thenReturn(new OutboxInspector.Page(List.of(entry(7, OutboxState.STUCK)), 3));

        mockMvc.perform(get("/api/query/admin/outbox/messages").param("state", "STUCK").param("page", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(7))
                .andExpect(jsonPath("$.content[0].state").value("STUCK"))
                .andExpect(jsonPath("$.content[0].key").value("ORD-1"))
                .andExpect(jsonPath("$.content[0].attempts").value(10))
                .andExpect(jsonPath("$.content[0].maxAttempts").value(10))
                .andExpect(jsonPath("$.content[0].lastError").value("boom"))
                .andExpect(jsonPath("$.page.totalElements").value(3))
                .andExpect(jsonPath("$.page.totalPages").value(2))
                .andExpect(jsonPath("$.page.number").value(1))
                .andExpect(jsonPath("$.page.size").value(2));
    }

    @Test
    void rejectsInvalidStatePageOrSize() throws Exception {
        when(inspector.page(null, -1, 50)).thenThrow(new IllegalArgumentException("page must be >= 0"));
        when(inspector.page(null, 0, 201)).thenThrow(new IllegalArgumentException("size between 1 and 200"));

        mockMvc.perform(get("/api/query/admin/outbox/messages").param("state", "LOST")).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/query/admin/outbox/messages").param("page", "-1")).andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/query/admin/outbox/messages").param("size", "201")).andExpect(status().isBadRequest());
    }

    @Test
    void outboxMessageWithPayload() throws Exception {
        var payload = JsonNodeFactory.instance.objectNode().put("execId", "EX-1");
        when(inspector.get(7L)).thenReturn(Optional.of(new OutboxInspector.Detail(entry(7, OutboxState.STUCK), payload, 12, null)));

        mockMvc.perform(get("/api/query/admin/outbox/messages/7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.state").value("STUCK"))
                .andExpect(jsonPath("$.orderId").value("ORD-1"))
                .andExpect(jsonPath("$.payload.execId").value("EX-1"))
                .andExpect(jsonPath("$.payloadSchemaId").value(12));
    }

    @Test
    void unknownOutboxMessageIs404() throws Exception {
        when(inspector.get(99L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/query/admin/outbox/messages/99"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
    }

    @Test
    void deadLetterTopicsAndRecords() throws Exception {
        when(reader.topics()).thenReturn(List.of(new DeadLetterTopic("commands.DLT", 3, 5)));
        var payload = JsonNodeFactory.instance.objectNode().put("orderId", "ORD-1");
        when(reader.records("commands.DLT", 10)).thenReturn(List.of(new DeadLetterRecord(
                "commands.DLT", 0, 4, CREATED, "ORD-1", "commands", 0, 41L, CREATED,
                "org.example.Boom", "boom", null, PayloadFormat.AVRO, payload, null, null,
                Map.of("kafka_dlt-original-topic", "commands"))));

        mockMvc.perform(get("/api/query/admin/dead-letters"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].topic").value("commands.DLT"))
                .andExpect(jsonPath("$[0].partitions").value(3))
                .andExpect(jsonPath("$[0].records").value(5));
        mockMvc.perform(get("/api/query/admin/dead-letters/commands.DLT/records").param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].offset").value(4))
                .andExpect(jsonPath("$[0].originalTopic").value("commands"))
                .andExpect(jsonPath("$[0].originalOffset").value(41))
                .andExpect(jsonPath("$[0].exceptionClass").value("org.example.Boom"))
                .andExpect(jsonPath("$[0].payloadFormat").value("AVRO"))
                .andExpect(jsonPath("$[0].payload.orderId").value("ORD-1"))
                .andExpect(jsonPath("$[0].headers['kafka_dlt-original-topic']").value("commands"));
    }

    @Test
    void rejectsANonDeadLetterTopicOrLimit() throws Exception {
        mockMvc.perform(get("/api/query/admin/dead-letters/commands/records")).andExpect(status().isBadRequest());
        verify(reader, never()).records(anyString(), anyInt());
        when(reader.records("commands.DLT", 0)).thenThrow(new IllegalArgumentException("limit must be between 1 and 500"));
        mockMvc.perform(get("/api/query/admin/dead-letters/commands.DLT/records").param("limit", "0"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownDeadLetterTopicIs404() throws Exception {
        when(reader.records("gone.DLT", 50)).thenThrow(new AdminNotFoundException("No such dead-letter topic: gone.DLT"));

        mockMvc.perform(get("/api/query/admin/dead-letters/gone.DLT/records")).andExpect(status().isNotFound());
    }

    @Test
    void kafkaUnavailableIs503Problem() throws Exception {
        when(reader.topics()).thenThrow(new DeadLetterUnavailableException("Could not list dead-letter topics on 127.0.0.1:1: TimeoutException"));

        mockMvc.perform(get("/api/query/admin/dead-letters"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("Could not list dead-letter topics on 127.0.0.1:1: TimeoutException"));
    }
}
