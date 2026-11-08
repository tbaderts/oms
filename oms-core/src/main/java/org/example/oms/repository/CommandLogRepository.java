package org.example.oms.repository;

import java.util.List;

import org.example.oms.model.CommandLogEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** The command log (SPEC-0046): written by {@code CommandLogWriter}, read by the query API. */
@Repository
public interface CommandLogRepository extends JpaRepository<CommandLogEntry, Long> {

    /** An order's command log, oldest first: by when each command was received, then as logged. */
    List<CommandLogEntry> findByOrderIdOrderByReceivedAtAscIdAsc(String orderId);
}
