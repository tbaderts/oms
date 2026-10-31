package org.example.oms.projection;

import org.apache.avro.specific.SpecificRecord;

/**
 * A message a projection wants published, staged in the outbox in the command transaction.
 *
 * @param topic the target topic
 * @param key the Kafka key (the order's partition key)
 * @param version the event-log version the message corresponds to
 * @param payload the Avro record to publish
 */
public record StagedMessage(String topic, String key, long version, SpecificRecord payload) {}
