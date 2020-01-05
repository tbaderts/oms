package org.example.simulator.server;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import quickfix.FieldNotFound;
import quickfix.Message;
import quickfix.Session;
import quickfix.SessionID;
import quickfix.SessionNotFound;
import quickfix.field.AvgPx;
import quickfix.field.ClOrdID;
import quickfix.field.CumQty;
import quickfix.field.Currency;
import quickfix.field.ExecID;
import quickfix.field.ExecType;
import quickfix.field.LeavesQty;
import quickfix.field.OrdStatus;
import quickfix.field.OrderID;
import quickfix.field.SenderCompID;
import quickfix.field.Side;
import quickfix.field.Symbol;
import quickfix.field.TargetCompID;
import quickfix.fix44.ExecutionReport;
import quickfix.fix44.NewOrderSingle;

@Component
public class AutoResponder {

	private static final Logger LOGGER = LoggerFactory.getLogger(AutoResponder.class);
	private AtomicInteger count = new AtomicInteger();

	public void sendResponse(Message message, SessionID sessionId) {

		if (message instanceof NewOrderSingle) {
			NewOrderSingle order = (NewOrderSingle) message;

			try {
				ExecutionReport ack = new ExecutionReport();
				ack.getHeader().setField(new SenderCompID("SIMULATOR"));
				ack.getHeader().setField(new TargetCompID("DEMO"));
				ack.set(new OrdStatus(OrdStatus.NEW));
				ack.set(new ExecID("x" + count.getAndIncrement()));
				ack.set(new OrderID(UUID.randomUUID().toString()));
				ack.set(new ClOrdID(order.getClOrdID().getValue()));
				ack.set(new Currency(order.getCurrency().getValue()));
				ack.set(new ExecType(ExecType.ORDER_STATUS));
				ack.set(new Symbol(order.getSymbol().getValue()));
				ack.set(new Side(order.getSide().getValue()));
				ack.set(new LeavesQty(order.getOrderQty().getValue()));
				ack.set(new CumQty(0));
				ack.set(new AvgPx(0));
				
				LOGGER.info("Sending ack: {}", ack);
				Session.sendToTarget(ack, sessionId);
			} catch (SessionNotFound | FieldNotFound e) {
				LOGGER.error("Exception while sending message: {}", e);
			}
		}
	}
}
