package org.example.oms.api;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.Set;

import org.example.common.model.cmd.Execution;
import org.example.common.model.cmd.ExecutionCreateCmd;
import org.example.common.model.cmd.OrdType;
import org.example.common.model.cmd.Order;
import org.example.common.model.cmd.OrderAcceptCmd;
import org.example.common.model.cmd.OrderCreateCmd;
import org.example.common.model.cmd.Side;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;

class CommandModelValidationTest {

    private Validator validator;

    @BeforeEach
    void setUp() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    void orderCreateCmd_requiresOrder() {
        OrderCreateCmd command = new OrderCreateCmd().type("OrderCreateCmd");
        Set<ConstraintViolation<OrderCreateCmd>> violations = validator.validate(command);

        assertTrue(violations.stream().anyMatch(v -> "order".equals(v.getPropertyPath().toString())));
    }

    @Test
    void orderCreateCmd_requiresSessionId() {
        assertTrue(validator.validate(createCmd("S1")).isEmpty());

        Set<ConstraintViolation<OrderCreateCmd>> violations = validator.validate(createCmd(null));

        assertTrue(violations.stream().anyMatch(v -> "order.sessionId".equals(v.getPropertyPath().toString())));
    }

    @Test
    void orderCreateCmd_rejectsEmptySessionId() {
        Set<ConstraintViolation<OrderCreateCmd>> violations = validator.validate(createCmd(""));

        assertTrue(violations.stream().anyMatch(v -> "order.sessionId".equals(v.getPropertyPath().toString())));
    }

    private static OrderCreateCmd createCmd(String sessionId) {
        Order order = new Order()
                .sessionId(sessionId)
                .clOrdId("C1")
                .account("A1")
                .symbol("AAPL")
                .side(Side.BUY)
                .ordType(OrdType.LIMIT)
                .orderQty(BigDecimal.ONE)
                .price(BigDecimal.ONE);
        return new OrderCreateCmd().type("OrderCreateCmd").order(order);
    }

    @Test
    void orderAcceptCmd_requiresNonBlankOrderId() {
        OrderAcceptCmd command = new OrderAcceptCmd("", "OrderAcceptCmd");
        Set<ConstraintViolation<OrderAcceptCmd>> violations = validator.validate(command);

        assertFalse(violations.isEmpty());
    }

    @Test
    void executionCreateCmd_requiresExecution() {
        ExecutionCreateCmd command = new ExecutionCreateCmd().type("ExecutionCreateCmd");
        Set<ConstraintViolation<ExecutionCreateCmd>> violations = validator.validate(command);

        assertTrue(violations.stream().anyMatch(v -> "execution".equals(v.getPropertyPath().toString())));
    }

    @Test
    void execution_requiresIds() {
        Execution execution = new Execution();
        Set<ConstraintViolation<Execution>> violations = validator.validate(execution);

        assertTrue(violations.stream().anyMatch(v -> "execId".equals(v.getPropertyPath().toString())));
        assertTrue(violations.stream().anyMatch(v -> "orderId".equals(v.getPropertyPath().toString())));
    }
}
