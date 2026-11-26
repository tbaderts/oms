package org.example.price.api;

import java.net.URI;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.ConstraintViolationException;

/**
 * Errors of the market data API as Problem+JSON, in the format oms-core uses
 * (framework/exception-handling.md): a parameter outside the contract is a 400, a symbol nobody
 * prices a 404 (SPEC-0079).
 */
@RestControllerAdvice(assignableTypes = MarketDataController.class)
class PriceExceptionHandler {

    @ExceptionHandler(ConstraintViolationException.class)
    ProblemDetail invalidParameter(ConstraintViolationException e) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Validation failed for one or more parameters");
        problem.setType(URI.create("urn:oms:error:validation-failed"));
        problem.setTitle("Validation Failed");
        Map<String, String> errors = e.getConstraintViolations().stream()
                .collect(Collectors.toMap(
                        v -> {
                            String path = v.getPropertyPath().toString();
                            return path.substring(path.lastIndexOf('.') + 1);
                        },
                        v -> v.getMessage(),
                        (a, b) -> a + "; " + b));
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail notFound(ResponseStatusException e) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(e.getStatusCode(), e.getReason());
        problem.setType(URI.create("urn:oms:error:not-found"));
        problem.setTitle("Not Found");
        return problem;
    }
}
