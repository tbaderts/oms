package org.example.rsocket.server;

import com.fasterxml.jackson.core.JsonFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import net.logstash.logback.decorate.JsonFactoryDecorator;

public class ISO8601DateDecorator implements JsonFactoryDecorator {

	@Override
	public JsonFactory decorate(JsonFactory factory) {
		ObjectMapper codec = (ObjectMapper) factory.getCodec();
		codec.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);
		return factory;
	}
}