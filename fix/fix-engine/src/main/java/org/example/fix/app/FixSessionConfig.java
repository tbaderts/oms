package org.example.fix.app;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.PostConstruct;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "fix")
public class FixSessionConfig {

	private List<FixSession> sessions = new ArrayList<>();
	private Map<String, FixSession> sessionMap = new HashMap<>();

	@PostConstruct
	private void init() {
		sessions.forEach(session -> sessionMap.put(session.getDestinationUser(), session));
	}

	public List<FixSession> getSessions() {
		return sessions;
	}

	public Map<String, FixSession> getSessionMap() {
		return sessionMap;
	}
}
