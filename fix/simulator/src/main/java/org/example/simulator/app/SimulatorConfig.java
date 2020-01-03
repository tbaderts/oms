package org.example.simulator.app;

import java.io.IOException;

import org.example.simulator.server.SimulatorApp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;

import quickfix.ConfigError;
import quickfix.DefaultMessageFactory;
import quickfix.FileLogFactory;
import quickfix.FileStoreFactory;
import quickfix.LogFactory;
import quickfix.MessageFactory;
import quickfix.MessageStoreFactory;
import quickfix.SessionSettings;
import quickfix.ThreadedSocketAcceptor;
import quickfix.ThreadedSocketInitiator;

@Configuration
public class SimulatorConfig {

	private static final Logger LOGGER = LoggerFactory.getLogger(SimulatorConfig.class);
	private final SimulatorApp fixEngine;
	private final Resource sessionConfig;

	@Autowired
	public SimulatorConfig(SimulatorApp fixEngine, @Value("classpath:session.cfg") Resource sessionConfig) {
		this.fixEngine = fixEngine;
		this.sessionConfig = sessionConfig;
	}

	@Bean
	public ThreadedSocketInitiator threadedSocketInitiator() {
		try {
			SessionSettings settings = new SessionSettings(sessionConfig.getInputStream());
			MessageStoreFactory storeFactory = new FileStoreFactory(settings);
			LogFactory logFactory = new FileLogFactory(settings);
			MessageFactory messageFactory = new DefaultMessageFactory();
			return new ThreadedSocketInitiator(fixEngine, storeFactory, settings, logFactory, messageFactory);
		} catch (ConfigError | IOException e) {
			LOGGER.error("Exception while creating SocketInitiator", e);
		}
		return null;
	}

	@Bean
	public ThreadedSocketAcceptor threadedSocketAcceptor() {
		try {
			SessionSettings settings = new SessionSettings(sessionConfig.getInputStream());
			MessageStoreFactory storeFactory = new FileStoreFactory(settings);
			LogFactory logFactory = new FileLogFactory(settings);
			MessageFactory messageFactory = new DefaultMessageFactory();
			return new ThreadedSocketAcceptor(fixEngine, storeFactory, settings, logFactory, messageFactory);
		} catch (ConfigError | IOException e) {
			LOGGER.error("Exception while creating ThreadedSocketAcceptor", e);
		}
		return null;
	}

}
