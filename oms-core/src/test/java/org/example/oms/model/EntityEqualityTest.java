package org.example.oms.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.lang.reflect.Field;

import org.example.common.model.Execution;
import org.example.common.model.Order;
import org.junit.jupiter.api.Test;

class EntityEqualityTest {

    @Test
    void orderEvent_transientInstancesAreNotEqual() {
        OrderEvent left = OrderEvent.builder().build();
        OrderEvent right = OrderEvent.builder().build();

        assertNotEquals(left, right);
    }

    @Test
    void orderEvent_sameNonNullIdIsEqual() throws Exception {
        OrderEvent left = OrderEvent.builder().build();
        OrderEvent right = OrderEvent.builder().build();

        setId(left, 10L);
        setId(right, 10L);

        assertEquals(left, right);
    }

    @Test
    void orderOutbox_transientInstancesAreNotEqual() {
        OrderOutbox left = OrderOutbox.builder().build();
        OrderOutbox right = OrderOutbox.builder().build();

        assertNotEquals(left, right);
    }

    @Test
    void orderOutbox_sameNonNullIdIsEqual() throws Exception {
        OrderOutbox left = OrderOutbox.builder().build();
        OrderOutbox right = OrderOutbox.builder().build();

        setId(left, 20L);
        setId(right, 20L);

        assertEquals(left, right);
    }

    @Test
    void order_transientInstancesAreNotEqual() {
        Order left = Order.builder().build();
        Order right = Order.builder().build();

        assertNotEquals(left, right);
    }

    @Test
    void order_sameNonNullIdIsEqual() throws Exception {
        Order left = Order.builder().build();
        Order right = Order.builder().build();

        setId(left, 30L);
        setId(right, 30L);

        assertEquals(left, right);
    }

    @Test
    void execution_transientInstancesAreNotEqual() {
        Execution left = Execution.builder().build();
        Execution right = Execution.builder().build();

        assertNotEquals(left, right);
    }

    @Test
    void execution_sameNonNullIdIsEqual() throws Exception {
        Execution left = Execution.builder().build();
        Execution right = Execution.builder().build();

        setId(left, 40L);
        setId(right, 40L);

        assertEquals(left, right);
    }

    private void setId(Object target, Long id) throws Exception {
        Field field = target.getClass().getDeclaredField("id");
        field.setAccessible(true);
        field.set(target, id);
    }
}
