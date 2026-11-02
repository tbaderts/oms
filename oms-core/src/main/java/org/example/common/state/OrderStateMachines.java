package org.example.common.state;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.springframework.stereotype.Component;

/**
 * Which state machine governs an order (SPEC-0029).
 *
 * <p>Every processor and task asks here instead of building its own. Today every order runs the
 * {@linkplain OrderStateMachineConfig#product() product configuration}; once order trees exist, this
 * is where a leg's configuration will be chosen (a parent, a child sent to a venue, an allocation).
 */
@Component
public class OrderStateMachines {

    private final StateMachine<State> product = OrderStateMachineConfig.createProduct();

    public StateMachine<State> forOrder(Order order) {
        return product;
    }
}
