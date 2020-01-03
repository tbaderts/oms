package org.example.simulator.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import quickfix.Application;
import quickfix.DoNotSend;
import quickfix.FieldNotFound;
import quickfix.IncorrectDataFormat;
import quickfix.IncorrectTagValue;
import quickfix.Message;
import quickfix.RejectLogon;
import quickfix.SessionID;
import quickfix.UnsupportedMessageType;

@Component
public class SimulatorApp implements Application {

	private static final Logger LOGGER = LoggerFactory.getLogger(SimulatorApp.class);
	private final AutoResponder autoResponder;

	@Autowired
	public SimulatorApp(AutoResponder autoResponder) {
		this.autoResponder = autoResponder;
	}

	@Override
	public void onCreate(SessionID sessionId) {
		LOGGER.info("onCreate, sessionId: {}", sessionId);
	}

	@Override
	public void onLogon(SessionID sessionId) {
		LOGGER.info("onLogon, sessionId: {}", sessionId);
	}

	@Override
	public void onLogout(SessionID sessionId) {
		LOGGER.info("onLogout, sessionId: {}", sessionId);
	}

	@Override
	public void toAdmin(Message message, SessionID sessionId) {
		LOGGER.info("toAdmin, message: {}, sessionId: {}", message, sessionId);
	}

	@Override
	public void fromAdmin(Message message, SessionID sessionId)
			throws FieldNotFound, IncorrectDataFormat, IncorrectTagValue, RejectLogon {
		LOGGER.info("fromAdmin, message: {}, sessionId: {}", message, sessionId);
	}

	@Override
	public void toApp(Message message, SessionID sessionId) throws DoNotSend {
		LOGGER.info("toApp, message: {}, sessionId: {}", message, sessionId);
	}

	@Override
	public void fromApp(Message message, SessionID sessionId) throws FieldNotFound, IncorrectDataFormat, IncorrectTagValue, UnsupportedMessageType {
		LOGGER.info("fromApp, message: {}, sessionId: {}", message, sessionId);
		autoResponder.sendResponse(message, sessionId);
	}

}
