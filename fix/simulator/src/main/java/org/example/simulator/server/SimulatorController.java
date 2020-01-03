package org.example.simulator.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import quickfix.Session;
import quickfix.SessionID;
import quickfix.ThreadedSocketAcceptor;
import quickfix.ThreadedSocketInitiator;
import reactor.core.publisher.Mono;

@RestController
public class SimulatorController {

	private static final Logger LOGGER = LoggerFactory.getLogger(SimulatorController.class);
	private final ThreadedSocketInitiator threadedSocketInitiator;
	private final ThreadedSocketAcceptor threadedSocketAcceptor;

	@Autowired
	public SimulatorController(ThreadedSocketInitiator threadedSocketInitiator, ThreadedSocketAcceptor threadedSocketAcceptor) {
		this.threadedSocketInitiator = threadedSocketInitiator;
		this.threadedSocketAcceptor = threadedSocketAcceptor;
	}

	@GetMapping(value = "/admin")
	public Mono<String> admin() {
		if (threadedSocketInitiator.getSessions() != null && !threadedSocketInitiator.getSessions().isEmpty()) {
			for (SessionID sessionID : threadedSocketInitiator.getSessions()) {
				LOGGER.info("Initiator sessionID={}, isLoggedOn={}", sessionID, Session.lookupSession(sessionID).isLoggedOn());
			}
		}
		
		if (threadedSocketAcceptor.getSessions() != null && !threadedSocketAcceptor.getSessions().isEmpty()) {
			for (SessionID sessionID : threadedSocketAcceptor.getSessions()) {
				LOGGER.info("Acceptor sessionID={}, isLoggedOn={}", sessionID, Session.lookupSession(sessionID).isLoggedOn());
			}
		}
		
		return Mono.empty();
	}

}
