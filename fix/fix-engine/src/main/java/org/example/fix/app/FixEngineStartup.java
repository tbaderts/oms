package org.example.fix.app;

import javax.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

import quickfix.ConfigError;
import quickfix.RuntimeError;
import quickfix.ThreadedSocketAcceptor;
import quickfix.ThreadedSocketInitiator;

@Component
public class FixEngineStartup implements ApplicationListener<ApplicationReadyEvent> {

	private static final Logger LOGGER = LoggerFactory.getLogger(FixEngineStartup.class);
	private final ThreadedSocketInitiator threadedSocketInitiator;
	private final ThreadedSocketAcceptor threadedSocketAcceptor;

	@Autowired
	public FixEngineStartup(ThreadedSocketInitiator threadedSocketInitiator,
			ThreadedSocketAcceptor threadedSocketAcceptor) {
		this.threadedSocketInitiator = threadedSocketInitiator;
		this.threadedSocketAcceptor = threadedSocketAcceptor;
	}

	@Override
	public void onApplicationEvent(ApplicationReadyEvent event) {
		LOGGER.info("FixEngine ready");

		try {
			threadedSocketAcceptor.start();
			threadedSocketInitiator.start();
		} catch (RuntimeError | ConfigError e) {
			LOGGER.error("Exception while starting FixEngine", e);
		}
	}

	@PreDestroy
	private void stop() {
		LOGGER.info("Stopping session");
		threadedSocketInitiator.stop();
		threadedSocketAcceptor.stop();
	}

}
