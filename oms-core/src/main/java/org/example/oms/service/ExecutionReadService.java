package org.example.oms.service;

import java.util.Optional;

import org.example.common.model.Execution;
import org.example.oms.repository.ExecutionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExecutionReadService {

    private final ExecutionRepository executionRepository;

    public Page<Execution> findAll(Pageable pageable) {
        return executionRepository.findAll(pageable);
    }

    public Optional<Execution> findById(Long id) {
        return executionRepository.findById(id);
    }
}
