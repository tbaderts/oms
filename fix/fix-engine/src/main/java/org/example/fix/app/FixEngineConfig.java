package org.example.fix.app;

import java.io.IOException;
import java.util.Collections;
import java.util.List;

import javax.management.JMException;

import org.example.fix.server.FixEngineApp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.retry.RetryCallback;
import org.springframework.retry.RetryContext;
import org.springframework.retry.RetryListener;
import org.springframework.retry.listener.RetryListenerSupport;

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
public class FixEngineConfig {

	private static final Logger LOGGER = LoggerFactory.getLogger(FixEngineConfig.class);
	private final FixEngineApp fixEngine;
	private final Resource sessionConfig;

	@Autowired
	public FixEngineConfig(FixEngineApp fixEngine, @Value("classpath:session.cfg") Resource sessionConfig) throws JMException {
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

	@Bean
	public List<RetryListener> retryListeners() {
		return Collections.singletonList(new RetryListenerSupport() {
			@Override
			public <T, E extends Throwable> void onError(RetryContext context, RetryCallback<T, E> callback, Throwable throwable) {
				LOGGER.warn("Exception calling retryable method: {}, retry count={}, exception:", context.getAttribute("context.name"),
						context.getRetryCount(), throwable);
			}
		});
	}

}
