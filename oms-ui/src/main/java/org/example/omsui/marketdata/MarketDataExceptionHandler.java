package org.example.omsui.marketdata;

import java.net.URI;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.validation.ConstraintViolationException;

/**
 * Market data errors as Problem+JSON, in the format oms-core uses (framework/exception-handling.md):
 * parameters outside the contract (a missing or too long query) are a 400, an unreachable price
 * service a 503 (SPEC-0079), never a 500.
 */
@RestControllerAdvice(assignableTypes = MarketDataController.class)
class MarketDataExceptionHandler {

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

    /** The price service cannot be reached: order entry shows a notice and takes the symbol typed by hand (SPEC-0079). */
    @ExceptionHandler(PriceServiceUnavailableException.class)
    ProblemDetail priceServiceUnavailable(PriceServiceUnavailableException e) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
                HttpStatus.SERVICE_UNAVAILABLE, "Market data unavailable: the price service cannot be reached");
        problem.setType(URI.create("urn:oms:error:price-service-unavailable"));
        problem.setTitle("Price Service Unavailable");
        return problem;
    }
}
