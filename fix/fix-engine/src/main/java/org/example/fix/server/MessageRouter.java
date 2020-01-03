package org.example.fix.server;

import org.example.fix.app.FixSessionConfig;
import org.example.fix.domain.Order;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import quickfix.Session;
import quickfix.SessionID;
import quickfix.SessionNotFound;

@Component
public class MessageRouter {

	private static final Logger LOGGER = LoggerFactory.getLogger(MessageRouter.class);
	private final MessageMapper messageMapper;
	private final FixSessionConfig fixSessionConfig;

	@Autowired
	public MessageRouter(MessageMapper messageMapper, FixSessionConfig fixSessionConfig) {
		this.messageMapper = messageMapper;
		this.fixSessionConfig = fixSessionConfig;
	}

	public void route(Order order) {
		String sessionIDString = fixSessionConfig.getSessionMap().get(order.getDestinationUser()).getSessionID();
		SessionID sessionID = new SessionID(sessionIDString);

		try {
			Session.sendToTarget(messageMapper.mapOrder(order), sessionID);
		} catch (SessionNotFound e) {
			LOGGER.error("Exception while sending message: {}", e);
		}
	}

}
