package org.example.fix.admin;

import org.apache.commons.lang3.builder.ReflectionToStringBuilder;

public class SessionStatus {
	private String sessionID;
	private SessionType sessionType;
	private boolean isLoggedOn;
	private Integer expectedSenderSeqNum;
	private Integer expectedTargerSeqNum;
	private String remoteAddress;

	public String getSessionID() {
		return sessionID;
	}

	public void setSessionID(String sessionID) {
		this.sessionID = sessionID;
	}

	public SessionType getSessionType() {
		return sessionType;
	}

	public void setSessionType(SessionType sessionType) {
		this.sessionType = sessionType;
	}

	public boolean isLoggedOn() {
		return isLoggedOn;
	}

	public void setLoggedOn(boolean isLoggedOn) {
		this.isLoggedOn = isLoggedOn;
	}

	public Integer getExpectedSenderSeqNum() {
		return expectedSenderSeqNum;
	}

	public void setExpectedSenderSeqNum(Integer expectedSenderSeqNum) {
		this.expectedSenderSeqNum = expectedSenderSeqNum;
	}

	public Integer getExpectedTargerSeqNum() {
		return expectedTargerSeqNum;
	}

	public void setExpectedTargerSeqNum(Integer expectedTargerSeqNum) {
		this.expectedTargerSeqNum = expectedTargerSeqNum;
	}
	
	public String getRemoteAddress() {
		return remoteAddress;
	}

	public void setRemoteAddress(String remoteAddress) {
		this.remoteAddress = remoteAddress;
	}

	public String toString() {
		return ReflectionToStringBuilder.toString(this);
	}
}
