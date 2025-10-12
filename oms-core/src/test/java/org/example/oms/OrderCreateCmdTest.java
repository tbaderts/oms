package org.example.oms;

import java.math.BigDecimal;

import org.example.common.model.cmd.ExecInst;
import org.example.common.model.cmd.HandlInst;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.Order;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.PriceType;
import org.example.common.model.cmd.SecurityIdSource;
import org.example.common.model.cmd.Side;
import org.example.common.model.cmd.TimeInForce;
import org.example.common.util.JsonHelper;
import org.junit.jupiter.api.Test;

public class OrderCreateCmdTest {

    @Test
    public void testOrderCreateCmd() {
        Order order =
                Order.builder()
                        .sessionId("test-session")
                        .clOrdId("20250621-test-001")
                        // .sendingTime(Instant.now())
                        .account("test-account")
                        .execInst(ExecInst.NO_CROSS)
                        .handlInst(HandlInst.AUTO)
                        .securityIdSource(SecurityIdSource.ISIN)
                        .orderQty(new BigDecimal("100.00"))
                        .securityDesc("desc")
                        .priceType(PriceType.PER_UNIT)
                        .ordType(OrdType.LIMIT)
                        .price(new BigDecimal("172.06"))
                        .securityId("US0378331005")
                        .side(Side.BUY)
                        .symbol("AAPL")
                        .timeInForce(TimeInForce.DAY)
                        .exDestination("XNAS")
                        .settlCurrency("USD")
                        .securityExchange("XNAS")
                        .text("Test order")
                        .build();

        OrderCreateCmd orderCreateCmd =
                OrderCreateCmd.builder().version("1.0.0").order(order).build();
        System.out.println(JsonHelper.toJson(orderCreateCmd));
    }
}
