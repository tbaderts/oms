package org.example.fix.app;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;

public class FixSession {
	private String sessionName;
	private String sessionID;
	private String destinationUser;

	public String getSessionName() {
		return sessionName;
	}

	public void setSessionName(String sessionName) {
		this.sessionName = sessionName;
	}

	public String getSessionID() {
		return sessionID;
	}

	public void setSessionID(String sessionID) {
		this.sessionID = sessionID;
	}

	public String getDestinationUser() {
		return destinationUser;
	}

	public void setDestinationUser(String destinationUser) {
		this.destinationUser = destinationUser;
	}
	
	public String toString() {
		return ReflectionToStringBuilder.toString(this);
	}

}
