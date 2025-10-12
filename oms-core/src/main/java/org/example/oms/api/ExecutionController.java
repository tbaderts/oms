package org.example.oms.api;

import java.util.List;
import java.util.Optional;

import org.example.common.model.Execution;
import org.example.oms.service.infra.repository.ExecutionRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

@RestController
@RequestMapping("/api/executions")
@Transactional(readOnly = true)
public class ExecutionController {

    private final ExecutionRepository executionRepository;

    public ExecutionController(ExecutionRepository executionRepository) {
        this.executionRepository = executionRepository;
    }

    @GetMapping
    @Hidden
    public List<Execution> getAllExecutions() {
        return executionRepository.findAll();
    }

    @GetMapping("/{id}")
    @Hidden
    public ResponseEntity<Execution> getExecutionById(@PathVariable Long id) {
        Optional<Execution> execution = executionRepository.findById(id);
        return execution.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
