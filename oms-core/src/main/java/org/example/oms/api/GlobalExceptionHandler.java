package org.example.oms.api;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.example.common.state.StateTransitionException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Bad request: {}", ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, ex.getMessage());
        problem.setType(URI.create("urn:oms:error:bad-request"));
        problem.setTitle("Bad Request");
        problem.setProperty("timestamp", Instant.now());
        return problem;
    }

    /**
     * Request bodies that break the contract (a required field missing, a string too short). The
     * format is the one in oms-framework/error-handling.md: every failing field, keyed by its path
     * (e.g. {@code order.sessionId}), so the caller can see what to fix. Spring's default body only
     * said "Invalid request content."
     */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        Map<String, List<String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.groupingBy(
                        FieldError::getField,
                        TreeMap::new,
                        Collectors.mapping(FieldError::getDefaultMessage, Collectors.toList())));
        log.warn("Validation failed for fields: {}", errors.keySet());

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Validation failed for one or more fields");
        problem.setType(URI.create("urn:oms:error:validation-failed"));
        problem.setTitle("Validation Failed");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("errorCode", "OMS-VAL-002");
        problem.setProperty("errors", errors);
        return handleExceptionInternal(ex, problem, headers, HttpStatus.BAD_REQUEST, request);
    }

    @ExceptionHandler(StateTransitionException.class)
    public ProblemDetail handleStateTransition(StateTransitionException ex) {
        log.warn("Invalid state transition: {}", ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT, ex.getMessage());
        problem.setType(URI.create("urn:oms:error:invalid-state-transition"));
        problem.setTitle("Invalid State Transition");
        problem.setProperty("timestamp", Instant.now());
        return problem;
    }

    /**
     * A unique-constraint violation here means a duplicate command, not a server fault — most often
     * a redelivered order with a clOrdId already seen on the session. Previously this escaped as a
     * 500 "An unexpected error occurred", which told the caller nothing actionable.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ProblemDetail handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.warn("Constraint violation: {}", ex.getMostSpecificCause().getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT,
                "The request conflicts with existing data. This is usually a duplicate command "
                        + "that has already been applied.");
        problem.setType(URI.create("urn:oms:error:conflict"));
        problem.setTitle("Conflict");
        problem.setProperty("timestamp", Instant.now());
        return problem;
    }

    /**
     * Two commands changed the same order concurrently and one lost. The command is safe to retry —
     * say so, rather than reporting an internal error.
     */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ProblemDetail handleOptimisticLocking(OptimisticLockingFailureException ex) {
        log.warn("Concurrent modification: {}", ex.getMessage());
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.CONFLICT,
                "The order was modified concurrently. Retry the command.");
        problem.setType(URI.create("urn:oms:error:concurrent-modification"));
        problem.setTitle("Concurrent Modification");
        problem.setProperty("timestamp", Instant.now());
        problem.setProperty("retryable", true);
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGeneric(Exception ex) {
        log.error("Unexpected error", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
        problem.setType(URI.create("urn:oms:error:internal"));
        problem.setTitle("Internal Server Error");
        problem.setProperty("timestamp", Instant.now());
        return problem;
    }
}
