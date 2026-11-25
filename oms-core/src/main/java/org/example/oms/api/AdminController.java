package org.example.oms.api;

import java.util.List;

import org.example.common.api.AdminApi;
import org.example.common.model.query.DeadLetterRecordDto;
import org.example.common.model.query.DeadLetterTopicDto;
import org.example.common.model.query.OutboxMessageDetailDto;
import org.example.common.model.query.OutboxState;
import org.example.common.model.query.OutboxSummaryDto;
import org.example.common.model.query.PageMetadata;
import org.example.common.model.query.PagedOutboxMessageDto;
import org.example.oms.admin.AdminNotFoundException;
import org.example.oms.admin.DeadLetterReader;
import org.example.oms.admin.OutboxInspector;
import org.example.oms.mapper.AdminDtoMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;

/**
 * The operator API (SPEC-0075, tag Admin of {@code oms-query-api.yml}): the outbox's waiting messages
 * and the dead-letter topics, read-only. Invalid input answers 400, an unknown message or topic 404,
 * and Kafka being unreachable 503, as problem details ({@link GlobalExceptionHandler}).
 */
@RestController
@RequestMapping("/api/query")
@RequiredArgsConstructor
public class AdminController implements AdminApi {

    private final OutboxInspector outboxInspector;
    private final DeadLetterReader deadLetterReader;
    private final AdminDtoMapper adminDtoMapper;

    @Override
    public ResponseEntity<OutboxSummaryDto> getOutboxSummary() {
        return ResponseEntity.ok(adminDtoMapper.toDto(outboxInspector.summary()));
    }

    @Override
    public ResponseEntity<PagedOutboxMessageDto> getOutboxMessages(OutboxState state, Integer page, Integer size) {
        int number = page == null ? 0 : page;
        int pageSize = size == null ? 50 : size;
        OutboxInspector.Page result = outboxInspector.page(
                state == null ? null : OutboxInspector.OutboxState.valueOf(state.name()), number, pageSize);
        PageMetadata metadata = PageMetadata.builder()
                .number(number)
                .size(pageSize)
                .totalElements((int) result.total())
                .totalPages((int) ((result.total() + pageSize - 1) / pageSize))
                .build();
        return ResponseEntity.ok(PagedOutboxMessageDto.builder()
                .content(adminDtoMapper.toDtos(result.content()))
                .page(metadata)
                .build());
    }

    @Override
    public ResponseEntity<OutboxMessageDetailDto> getOutboxMessage(Long id) {
        return outboxInspector.get(id)
                .map(adminDtoMapper::toDto)
                .map(ResponseEntity::ok)
                .orElseThrow(() -> new AdminNotFoundException("No outbox message " + id + " (it may have been published)"));
    }

    @Override
    public ResponseEntity<List<DeadLetterTopicDto>> getDeadLetterTopics() {
        return ResponseEntity.ok(adminDtoMapper.toTopicDtos(deadLetterReader.topics()));
    }

    @Override
    public ResponseEntity<List<DeadLetterRecordDto>> getDeadLetterRecords(String topic, Integer limit) {
        if (topic == null || !topic.endsWith(DeadLetterReader.SUFFIX)) {
            throw new IllegalArgumentException("Not a dead-letter topic (must end in " + DeadLetterReader.SUFFIX + "): " + topic);
        }
        return ResponseEntity.ok(adminDtoMapper.toRecordDtos(deadLetterReader.records(topic, limit == null ? 50 : limit)));
    }
}
