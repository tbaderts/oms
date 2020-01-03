package org.example.fix.server;

import java.time.LocalDateTime;

import org.example.fix.domain.Order;
import org.springframework.stereotype.Component;

import quickfix.field.Account;
import quickfix.field.BodyLength;
import quickfix.field.CheckSum;
import quickfix.field.ClOrdID;
import quickfix.field.Currency;
import quickfix.field.MsgSeqNum;
import quickfix.field.OrdType;
import quickfix.field.OrderQty;
import quickfix.field.SenderCompID;
import quickfix.field.SendingTime;
import quickfix.field.Side;
import quickfix.field.Symbol;
import quickfix.field.TargetCompID;
import quickfix.field.TransactTime;
import quickfix.fix44.NewOrderSingle;

@Component
public class MessageMapper {

	public NewOrderSingle mapOrder(Order order) {
		NewOrderSingle newOrderSingle = new NewOrderSingle();
		newOrderSingle.getHeader().setField(new MsgSeqNum(1));
		newOrderSingle.getHeader().setField(new SenderCompID("SENDER"));
		newOrderSingle.getHeader().setField(new TargetCompID("TARGET"));
		newOrderSingle.getHeader().setField(new SendingTime(LocalDateTime.now()));
		newOrderSingle.getHeader().setField(new BodyLength());
		newOrderSingle.getTrailer().setField(new CheckSum("37"));

		newOrderSingle.set(new Account("TEST"));
		newOrderSingle.set(new OrderQty(order.getQuantity().doubleValue()));
		newOrderSingle.set(new Symbol(order.getSymbol()));
		newOrderSingle.set(mapSide(order.getSide()));
		newOrderSingle.set(new ClOrdID("20191116-001"));
		newOrderSingle.set(new OrdType(OrdType.MARKET));
		newOrderSingle.set(new Currency("CHF"));
		newOrderSingle.set(new TransactTime(LocalDateTime.now()));
		return newOrderSingle;
	}
	
	private Side mapSide(org.example.fix.domain.Side side) {
		if (side == org.example.fix.domain.Side.BUY) {
			return new Side(Side.BUY);
		} else if (side == org.example.fix.domain.Side.SELL) {
			return new Side(Side.SELL);
		}
		return null;
	}
	
}
