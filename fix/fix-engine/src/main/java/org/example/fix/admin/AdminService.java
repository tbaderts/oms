package org.example.fix.admin;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import quickfix.Session;
import quickfix.SessionID;
import quickfix.ThreadedSocketAcceptor;
import quickfix.ThreadedSocketInitiator;

@Component
public class AdminService {

	private static final Logger LOGGER = LoggerFactory.getLogger(AdminService.class);
	private final ThreadedSocketInitiator threadedSocketInitiator;
	private final ThreadedSocketAcceptor threadedSocketAcceptor;

	@Autowired
	public AdminService(ThreadedSocketInitiator threadedSocketInitiator, ThreadedSocketAcceptor threadedSocketAcceptor) {
		this.threadedSocketInitiator = threadedSocketInitiator;
		this.threadedSocketAcceptor = threadedSocketAcceptor;
	}

	public List<SessionStatus> getStatus() {
		List<SessionStatus> sessions = new ArrayList<>();
		if (threadedSocketInitiator.getSessions() != null && !threadedSocketInitiator.getSessions().isEmpty()) {
			for (SessionID sessionID : threadedSocketInitiator.getSessions()) {
				LOGGER.info("Initiator sessionID={}, isLoggedOn={}", sessionID, Session.lookupSession(sessionID).isLoggedOn());
				sessions.add(getSessionStatus(sessionID, SessionType.INITIATOR));
			}
		}

		if (threadedSocketAcceptor.getSessions() != null && !threadedSocketAcceptor.getSessions().isEmpty()) {
			for (SessionID sessionID : threadedSocketAcceptor.getSessions()) {
				LOGGER.info("Acceptor sessionID={}, isLoggedOn={}", sessionID, Session.lookupSession(sessionID).isLoggedOn());
				sessions.add(getSessionStatus(sessionID, SessionType.ACCEPTOR));
			}
		}
		return sessions;
	}
	
	public void logon(SessionID sessionID) {
		LOGGER.info("Logon request for sessionID={}", sessionID);
		Session.lookupSession(sessionID).logon();
	}

	public void logout(SessionID sessionID) {
		LOGGER.info("Logout request for sessionID={}", sessionID);
		Session.lookupSession(sessionID).logout();
	}
	
	public void setNextSenderMsgSeqNum(SessionID sessionID, Integer seqNum) {
		try {
			LOGGER.info("Setting sender sequence number for session={} to {}", sessionID, seqNum);
			Session.lookupSession(sessionID).setNextSenderMsgSeqNum(seqNum);
		} catch (IOException e) {
			LOGGER.error("Excpetion while setting sender sequence number for session={}", sessionID, e);
		}
	}
	
	public void setNextTargetMsgSeqNum(SessionID sessionID, Integer seqNum) {
		try {
			LOGGER.info("Setting target sequence number for session={} to {}", sessionID, seqNum);
			Session.lookupSession(sessionID).setNextTargetMsgSeqNum(seqNum);
		} catch (IOException e) {
			LOGGER.error("Excpetion while setting target sequence number for session={}", sessionID, e);
		}
	}

	public void reset(SessionID sessionID) {
		try {
			LOGGER.info("Resetting sessionID={}", sessionID);
			Session.lookupSession(sessionID).reset();
		} catch (IOException e) {
			LOGGER.error("Excpetion while resetting session={}", sessionID, e);
		}
	}

	private SessionStatus getSessionStatus(SessionID sessionID, SessionType sessionType) {
		SessionStatus sessionStatus = new SessionStatus();
		sessionStatus.setSessionID(sessionID.toString());
		sessionStatus.setSessionType(sessionType);
		Session session = Session.lookupSession(sessionID);
		sessionStatus.setLoggedOn(session.isLoggedOn());
		sessionStatus.setExpectedSenderSeqNum(session.getExpectedSenderNum());
		sessionStatus.setExpectedTargerSeqNum(session.getExpectedTargetNum());
		sessionStatus.setRemoteAddress(session.getRemoteAddress());
		return sessionStatus;
	}
}
