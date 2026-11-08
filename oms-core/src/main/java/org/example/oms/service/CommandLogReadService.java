package org.example.oms.service;

import java.util.List;

import org.example.oms.model.CommandLogEntry;
import org.example.oms.repository.CommandLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

/** Reads the command log for the query API (SPEC-0046). */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommandLogReadService {

    private final CommandLogRepository commandLogRepository;

    /** Every command logged for the order, oldest first: by when it was received, then as logged. */
    public List<CommandLogEntry> findByOrderId(String orderId) {
        return commandLogRepository.findByOrderIdOrderByReceivedAtAscIdAsc(orderId);
    }
}
