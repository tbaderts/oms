package org.example.common.contracts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.apache.avro.Schema;
import org.junit.jupiter.api.Test;

/**
 * SPEC-0029 AC-7: the expire and close commands exist in both contracts, like the other lifecycle
 * commands — in the command API's discriminator, and as Avro records with the header first.
 */
class LifecycleCommandsContractTest {

    private static final String CMD_MODEL = "org.example.common.model.cmd.";

    @Test
    void expireAndCloseInTheDiscriminator() throws Exception {
        String spec = commandContract();
        for (String command : List.of("OrderExpireCmd", "OrderCloseCmd")) {
            assertTrue(spec.contains("          " + command + ": '#/components/schemas/" + command + "'"),
                    command + " in the Command discriminator");
            Class<?> model = Class.forName(CMD_MODEL + command);
            assertEquals(Class.forName(CMD_MODEL + "Command"), model.getSuperclass(), command + " is a Command");
            assertEquals(String.class, model.getMethod("getOrderId").getReturnType());
            assertEquals(String.class, model.getMethod("getText").getReturnType());

            Schema record = CommandSchemaTest.classSchema(command);
            assertEquals(Schema.Type.STRING, record.getField("orderId").schema().getType(), command + ".orderId required");
            assertEquals(Schema.Type.UNION, record.getField("text").schema().getType(), command + ".text optional");
        }
    }

    private static String commandContract() throws IOException {
        try (InputStream in = LifecycleCommandsContractTest.class.getResourceAsStream("/META-INF/oms-contracts/openapi/oms-cmd-api.yml")) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
