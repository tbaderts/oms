package org.example.fix;

import static org.hamcrest.CoreMatchers.instanceOf;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import quickfix.ConfigError;
import quickfix.DataDictionary;
import quickfix.DefaultMessageFactory;
import quickfix.FieldException;
import quickfix.FieldNotFound;
import quickfix.FixVersions;
import quickfix.InvalidMessage;
import quickfix.Message;
import quickfix.MessageFactory;
import quickfix.MessageUtils;
import quickfix.field.Account;
import quickfix.field.BodyLength;
import quickfix.field.CheckSum;
import quickfix.field.ClOrdID;
import quickfix.field.ContraBroker;
import quickfix.field.MsgSeqNum;
import quickfix.field.MsgType;
import quickfix.field.OrdType;
import quickfix.field.OrderQty;
import quickfix.field.SecurityID;
import quickfix.field.SenderCompID;
import quickfix.field.SendingTime;
import quickfix.field.Side;
import quickfix.field.Symbol;
import quickfix.field.TargetCompID;
import quickfix.field.TransactTime;
import quickfix.fix44.NewOrderSingle;

public class FixMessageTest {

	private String messageString = "8=FIX.4.49=14435=D34=149=SENDER52=20191116-19:05:45.11356=TARGET1=TEST11=20191116-00138=10040=148=US458140100154=155=INTC60=20191116-19:05:45.12810=037";

	@Test
	public void testCreateMessage() throws ConfigError {
		DataDictionary dictionary = new DataDictionary("src/main/resources/FIX44.xml");
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

		assertDoesNotThrow(() -> {
			dictionary.validate(order);
		});

		order.setField(new ContraBroker("abc"));

		assertThrows(FieldException.class, () -> {
			dictionary.validate(order);
		});
		
		MessageFactory factory = new DefaultMessageFactory();
		Message msg = factory.create(FixVersions.BEGINSTRING_FIX44, MsgType.ORDER_SINGLE);
		assertThat(msg, instanceOf(NewOrderSingle.class));
	}

	@Test
	public void parseMessage() throws ConfigError, InvalidMessage, FieldNotFound {
		DataDictionary dictionary = new DataDictionary("src/main/resources/FIX44.xml");
		Message msg = MessageUtils.parse(new DefaultMessageFactory(), dictionary, messageString);

		assertThat(msg, instanceOf(NewOrderSingle.class));
		assertEquals("20191116-001", ((NewOrderSingle) msg).getClOrdID().getValue());
	}

}
