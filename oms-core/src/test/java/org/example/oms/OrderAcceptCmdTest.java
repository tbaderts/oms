package org.example.oms;

import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.util.JsonHelper;
import org.junit.jupiter.api.Test;

public class OrderAcceptCmdTest {

    @Test
    public void testOrderAcceptCmd() {
        OrderAcceptCmd cmd = OrderAcceptCmd.builder().version("1.0").orderId("12345").build();

        System.out.println("OrderAcceptCmd created successfully: " + JsonHelper.toJson(cmd));
    }
}
