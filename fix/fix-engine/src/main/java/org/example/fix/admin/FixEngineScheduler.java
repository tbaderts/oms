package org.example.fix.admin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class FixEngineScheduler {
	
	private static final Logger LOGGER = LoggerFactory.getLogger(FixEngineScheduler.class);
	private final AdminService adminService;
	
	@Autowired
	public FixEngineScheduler(AdminService adminService) {
		this.adminService = adminService;
	}
	
	@Scheduled(fixedRate = 30000)
	public void onSchedule() {
		adminService.getStatus().forEach(s -> LOGGER.info("Session status for session: {}", s));
	}

}
