package org.example.oms.api;

import org.example.common.model.Execution;
import org.example.oms.service.ExecutionReadService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/executions")
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ExecutionController {

    private final ExecutionReadService executionReadService;

    @GetMapping
    @Hidden
    public Page<Execution> getAllExecutions(
            @PageableDefault(size = 50, sort = "id") Pageable pageable) {
        return executionReadService.findAll(pageable);
    }

    @GetMapping("/{id}")
    @Hidden
    public ResponseEntity<Execution> getExecutionById(@PathVariable Long id) {
        return executionReadService.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
