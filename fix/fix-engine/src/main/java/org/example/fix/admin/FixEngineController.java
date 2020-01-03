package org.example.fix.admin;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import quickfix.SessionID;

@RestController
public class FixEngineController {

	private final AdminService adminService;

	@Autowired
	public FixEngineController(AdminService adminService) {
		this.adminService = adminService;
	}

	@GetMapping(value = "/admin/sessionstatus")
	@ResponseBody
	public List<SessionStatus> getSessions() {
		return adminService.getStatus();
	}

	@PostMapping(value = "/admin/{sessionid}/logon")
	@ResponseStatus(value = HttpStatus.OK)
	public void logon(@PathVariable("sessionid") String sessionID) {
		adminService.logon(new SessionID(sessionID));
	}

	@PostMapping(value = "/admin/{sessionid}/logout")
	@ResponseStatus(value = HttpStatus.OK)
	public void logout(@PathVariable("sessionid") String sessionID) {
		adminService.logout(new SessionID(sessionID));
	}

	@PostMapping(value = "/admin/{sessionid}/setsenderseqnum/{seqNum}")
	@ResponseStatus(value = HttpStatus.OK)
	public void setNextSenderMsgSeqNum(@PathVariable("sessionid") String sessionID, @PathVariable("seqNum") Integer seqNum) {
		adminService.setNextSenderMsgSeqNum(new SessionID(sessionID), seqNum);
	}

	@PostMapping(value = "/admin/{sessionid}/settargetseqnum/{seqNum}")
	@ResponseStatus(value = HttpStatus.OK)
	public void setNextTargetMsgSeqNum(@PathVariable("sessionid") String sessionID, @PathVariable("seqNum") Integer seqNum) {
		adminService.setNextTargetMsgSeqNum(new SessionID(sessionID), seqNum);
	}

	@PostMapping(value = "/admin/{sessionid}/reset")
	@ResponseStatus(value = HttpStatus.OK)
	public void reset(@PathVariable("sessionid") String sessionID) {
		adminService.reset(new SessionID(sessionID));
	}

}
