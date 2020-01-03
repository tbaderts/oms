package org.example.fix.server;

import java.util.Optional;

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
		Optional<String> sessionIDString = Optional.ofNullable(fixSessionConfig.getSessionMap().get(order.getDestinationUser()).getSessionID());

		if (sessionIDString.isPresent()) {
			SessionID sessionID = new SessionID(sessionIDString.get());

			try {
				Session.sendToTarget(messageMapper.mapOrder(order), sessionID);
			} catch (SessionNotFound e) {
				LOGGER.error("Exception while sending message: {}", e);
			}
		} else {
			LOGGER.warn("No sessionID configured for destination user: {}", order.getDestinationUser());
		}
	}

}
