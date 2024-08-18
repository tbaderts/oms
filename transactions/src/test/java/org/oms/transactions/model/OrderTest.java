package org.oms.transactions.model;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

class OrderTest {

    private ObjectMapper mapper = new ObjectMapper();

    @Test
    void convertOrderToJson() throws JsonProcessingException {
        Order parentOrder = new Order();
        parentOrder.setId(UUID.randomUUID().toString());
        parentOrder.setOrderId("O123");
        parentOrder.setRootOrderId("O123");

        Fill parentFill = new Fill();
        parentFill.setId(UUID.randomUUID().toString());
        parentFill.setFillId("F123");
        parentFill.setExecID("X1");
        parentOrder.getFills().add(parentFill);

        Order childOrder = new Order();
        childOrder.setId(UUID.randomUUID().toString());
        childOrder.setOrderId("O456");
        childOrder.setRootOrderId("O123");
        childOrder.setParentOrderId("O123");
        parentOrder.getOrders().add(childOrder);

        Fill childFill = new Fill();
        childFill.setId(UUID.randomUUID().toString());
        childFill.setFillId("F456");
        childFill.setExecID("X1");
        childOrder.getFills().add(childFill);

        String jsonString = mapper.writeValueAsString(parentOrder);
        System.out.println(jsonString);
    }
}
