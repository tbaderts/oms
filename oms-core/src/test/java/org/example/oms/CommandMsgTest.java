package org.example.oms;

import org.example.common.model.msg.CommandMessage;
import org.example.common.model.msg.Order;
import org.example.common.model.msg.OrderCreateCmd;
import org.junit.jupiter.api.Test;

public class CommandMsgTest {

    @Test
    void testCreateCommandMessage() {
        CommandMessage commandMessage =
                CommandMessage.newBuilder()
                        .setCommand(
                                OrderCreateCmd.newBuilder()
                                        .setType(OrderCreateCmd.class.getSimpleName())
                                        .setOrder(
                                                Order.newBuilder()
                                                        .setClOrdId("20250621-test-001")
                                                        .setSessionId("test-session")
                                                        .build())
                                        .build())
                        .build();
        System.out.println("CommandMessage created: " + commandMessage);
    }
}
