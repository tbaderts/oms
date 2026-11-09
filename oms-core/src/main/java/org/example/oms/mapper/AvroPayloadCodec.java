package org.example.oms.mapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;

import org.apache.avro.io.BinaryEncoder;
import org.apache.avro.io.DecoderFactory;
import org.apache.avro.io.EncoderFactory;
import org.apache.avro.specific.SpecificDatumReader;
import org.apache.avro.specific.SpecificDatumWriter;
import org.apache.avro.specific.SpecificRecord;
import org.springframework.stereotype.Component;
import org.apache.avro.specific.SpecificData;
import org.apache.avro.Schema;

/**
 * Stores a projection's Avro message in the outbox's generic payload and reads it back (SPEC-0020).
 *
 * <p>The payload is the record's binary Avro encoding, and the type is its schema full name. Writing
 * and reading through the record's own class keeps its logical-type conversions (decimals, dates,
 * timestamps), so the decoded record equals the one staged. Since SPEC-0049 the row also records the
 * writer schema's registry id, and the payload is decoded with that writer schema and the current
 * class as reader, so a compatible change to the record between staging and publishing is resolved.
 *
 * <p>Only classes in the generated message package are resolved, so a tampered {@code payload_type}
 * cannot make the publisher load an arbitrary class.
 */
@Component
public class AvroPayloadCodec {

    static final String MESSAGE_PACKAGE = "org.example.common.model.msg.";

    public byte[] encode(SpecificRecord record) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            @SuppressWarnings("unchecked")
            SpecificDatumWriter<SpecificRecord> writer =
                    new SpecificDatumWriter<>((Class<SpecificRecord>) record.getClass());
            BinaryEncoder encoder = EncoderFactory.get().binaryEncoder(out, null);
            writer.write(record, encoder);
            encoder.flush();
            return out.toByteArray();
        } catch (IOException e) {
            throw new UncheckedIOException("Could not encode " + record.getSchema().getFullName(), e);
        }
    }

    public SpecificRecord decode(String type, byte[] payload) {
        return decode(type, payload, null);
    }

    /**
     * Decodes a payload encoded with {@code writer}, an earlier schema of the record, into the
     * current class by Avro schema resolution (SPEC-0049): values the writer wrote are kept, fields it
     * lacks take their defaults. With a null writer the class's own schema is used, as before.
     */
    public SpecificRecord decode(String type, byte[] payload, Schema writer) {
        Class<? extends SpecificRecord> recordClass = recordClass(type);
        try {
            SpecificData model = SpecificData.getForClass(recordClass);
            Schema readerSchema = model.getSchema(recordClass);
            SpecificDatumReader<? extends SpecificRecord> reader =
                    new SpecificDatumReader<>(writer != null ? writer : readerSchema, readerSchema, model);
            return reader.read(null, DecoderFactory.get().binaryDecoder(payload, null));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not decode payload of type " + type, e);
        }
    }

    private static Class<? extends SpecificRecord> recordClass(String type) {
        if (type == null || !type.startsWith(MESSAGE_PACKAGE)) {
            throw new IllegalStateException("Payload type outside " + MESSAGE_PACKAGE + ": " + type);
        }
        try {
            Class<?> candidate = Class.forName(type);
            if (!SpecificRecord.class.isAssignableFrom(candidate)) {
                throw new IllegalStateException("Payload type is not an Avro record: " + type);
            }
            return candidate.asSubclass(SpecificRecord.class);
        } catch (ClassNotFoundException e) {
            throw new IllegalStateException("Unknown payload type: " + type, e);
        }
    }
}
