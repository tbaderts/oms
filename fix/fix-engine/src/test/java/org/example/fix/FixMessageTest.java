package org.example.fix;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.example.fix.domain.Limit;
import org.example.fix.domain.LimitType;
import org.example.fix.domain.OrderLimits;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import quickfix.ConfigError;
import quickfix.DataDictionary;
import quickfix.DefaultMessageFactory;
import quickfix.FieldNotFound;
import quickfix.IncorrectDataFormat;
import quickfix.IncorrectTagValue;
import quickfix.InvalidMessage;
import quickfix.Message;
import quickfix.MessageFactory;
import quickfix.MessageUtils;
import quickfix.field.Account;
import quickfix.field.BodyLength;
import quickfix.field.CheckSum;
import quickfix.field.ClOrdID;
import quickfix.field.MsgSeqNum;
import quickfix.field.OrdType;
import quickfix.field.OrderQty;
import quickfix.field.SecurityID;
import quickfix.field.SenderCompID;
import quickfix.field.SendingTime;
import quickfix.field.Side;
import quickfix.field.Symbol;
import quickfix.field.TargetCompID;
import quickfix.field.Text;
import quickfix.field.TransactTime;
import quickfix.fix44.NewOrderSingle;

public class FixMessageTest {

	//private String messageString = "8=FIX.4.49=14435=D34=149=SENDER52=20191116-19:05:45.11356=TARGET1=TEST11=20191116-00138=10040=148=US458140100154=155=INTC60=20191116-19:05:45.12810=037";
	private String messageString = "8=FIX.4.49=29135=D34=149=SENDER52=20191116-19:37:15.75456=TARGET1=TEST11=20191116-00138=10040=148=US458140100154=155=INTC58={\"orderLimits\":[{\"limitValue\":99.15,\"limitType\":\"PERCENTAGE\",\"quantity\":100.0},{\"limitValue\":98.85,\"limitType\":\"PERCENTAGE\",\"quantity\":200.0}]}60=20191116-19:37:15.77110=079";

	@Test
	public void testCreateMessage()
			throws ConfigError, IncorrectTagValue, FieldNotFound, IncorrectDataFormat, JsonProcessingException {
		NewOrderSingle order = new NewOrderSingle();
		order.getHeader().setField(new MsgSeqNum(1));
		order.getHeader().setField(new SenderCompID("SENDER"));
		order.getHeader().setField(new TargetCompID("TARGET"));
		order.getHeader().setField(new SendingTime(LocalDateTime.now()));
		order.getHeader().setField(new BodyLength());
		order.getTrailer().setField(new CheckSum("37"));

		order.set(new Account("TEST"));
		order.set(new OrderQty(100));
		order.set(new SecurityID("US4581401001"));
		order.set(new Symbol("INTC"));
		order.set(new Side(Side.BUY));
		order.set(new ClOrdID("20191116-001"));
		order.set(new OrdType(OrdType.MARKET));
		order.set(new TransactTime(LocalDateTime.now()));
		order.set(new Text(setLimits()));

		DataDictionary dictionary = new DataDictionary("src/main/resources/FIX44.xml");
		dictionary.validate(order);

		System.out.println(order.toString());
		setLimits();
	}

	@Test
	public void parseMessage() throws ConfigError, InvalidMessage, FieldNotFound {
		MessageFactory messageFactory = new DefaultMessageFactory();
		DataDictionary dictionary = new DataDictionary("src/main/resources/FIX44.xml");
		Message msg = MessageUtils.parse(messageFactory, dictionary, messageString);

		if (msg instanceof NewOrderSingle) {
			NewOrderSingle order = (NewOrderSingle) msg;
			Text text = new Text();
			order.get(text);
			System.out.println(text);
		}
	}

	private String setLimits() throws JsonProcessingException {
		OrderLimits orderLimits = new OrderLimits();
		List<Limit> limits = new ArrayList<>();
		Limit l1 = new Limit();
		l1.setLimitType(LimitType.PERCENTAGE);
		l1.setQuantity(new Double(100));
		l1.setLimitValue(new Double(99.15));
		limits.add(l1);
		Limit l2 = new Limit();
		l2.setLimitType(LimitType.PERCENTAGE);
		l2.setQuantity(new Double(200));
		l2.setLimitValue(new Double(98.85));
		limits.add(l2);
		orderLimits.setOrderLimits(limits);

		ObjectMapper objectMapper = new ObjectMapper();
		return objectMapper.writeValueAsString(orderLimits);
	}

}
