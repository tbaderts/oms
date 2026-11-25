package org.example.oms.mapper;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.example.common.model.query.DeadLetterRecordDto;
import org.example.common.model.query.DeadLetterTopicDto;
import org.example.common.model.query.OutboxMessageDetailDto;
import org.example.common.model.query.OutboxMessageDto;
import org.example.common.model.query.OutboxSummaryDto;
import org.example.oms.admin.DeadLetterReader.DeadLetterRecord;
import org.example.oms.admin.DeadLetterReader.DeadLetterTopic;
import org.example.oms.admin.OutboxInspector;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * Maps the operator views (SPEC-0075) to the generated query DTOs. States and payload formats are
 * mapped by name: a value missing from the contract's enums fails compilation here. Timestamps are
 * UTC, as every other query timestamp.
 */
@Mapper(componentModel = "spring")
public interface AdminDtoMapper {

    OutboxSummaryDto toDto(OutboxInspector.Summary summary);

    OutboxMessageDto toDto(OutboxInspector.Entry entry);

    List<OutboxMessageDto> toDtos(List<OutboxInspector.Entry> entries);

    @Mapping(target = ".", source = "entry")
    OutboxMessageDetailDto toDto(OutboxInspector.Detail detail);

    DeadLetterTopicDto toDto(DeadLetterTopic topic);

    List<DeadLetterTopicDto> toTopicDtos(List<DeadLetterTopic> topics);

    DeadLetterRecordDto toDto(DeadLetterRecord record);

    List<DeadLetterRecordDto> toRecordDtos(List<DeadLetterRecord> records);

    default OffsetDateTime toOffsetDateTime(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
