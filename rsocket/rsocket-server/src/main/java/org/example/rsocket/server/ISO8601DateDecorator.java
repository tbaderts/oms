package org.example.rsocket.server;

import com.fasterxml.jackson.databind.MappingJsonFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import net.logstash.logback.decorate.JsonFactoryDecorator;

public class ISO8601DateDecorator implements JsonFactoryDecorator {

	@Override
	public MappingJsonFactory decorate(MappingJsonFactory factory) {
		ObjectMapper codec = factory.getCodec();
		codec.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);
		return factory;
	}
}