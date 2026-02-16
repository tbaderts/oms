# Validation Rules Framework Specification

**Version:** 1.0
**Last Updated:** 2026-02-14
**Author:** OMS Team
**Status:** Active

---

## 1. Introduction

This specification defines the predicate-based validation framework for the Order Management System (OMS). The framework provides a composable, reusable, and extensible approach to validating domain objects (orders, executions, quotes) against business rules.

### 1.1 Purpose

- Define a generic validation engine based on Java `Predicate<T>` and `Function<T, ValidationResult>`
- Provide reusable validation rules for orders, executions, and quotes
- Enable composable validation logic (AND, OR, NOT combinators)
- Support asset-class-specific validation extensibility
- Integrate with task orchestration framework for pipeline validation

### 1.2 Scope

**In Scope:**
- Validation framework architecture (ValidationRule, ValidationEngine, ValidationResult)
- Core validation rules for Order entity (required fields, quantity constraints, price validations)
- Core validation rules for Execution entity (positive quantities, state constraints)
- Validation composition patterns (combining rules)
- Asset-class extensibility (Equity, FX, Fixed Income specific rules)
- Integration with task pipeline (ValidateOrderTask, ValidateExecutionTask)

**Out of Scope:**
- Authorization/permission validation (covered in security specifications)
- External service validations (credit checks, compliance screening)
- Real-time market data validations (price reasonableness, volatility checks)

---

## 2. Validation Framework Architecture

### 2.1 Core Interfaces

#### ValidationRule<T>

```java
package org.example.common.validation;

import java.util.function.Predicate;

/**
 * Represents a validation rule for domain object of type T.
 * Combines a predicate test with descriptive metadata.
 *
 * @param <T> The type of object to validate
 */
@FunctionalInterface
public interface ValidationRule<T> {

    /**
     * Executes the validation rule against the provided object.
     *
     * @param object The object to validate
     * @return ValidationResult indicating success or failure with error details
     */
    ValidationResult validate(T object);

    /**
     * Returns the name/identifier of this validation rule.
     * Default implementation returns the class simple name.
     */
    default String name() {
        return this.getClass().getSimpleName();
    }

    /**
     * Returns a description of what this rule validates.
     */
    default String description() {
        return "Validation rule: " + name();
    }

    /**
     * Combines this rule with another using AND logic.
     * Both rules must pass for the combined rule to pass.
     */
    default ValidationRule<T> and(ValidationRule<T> other) {
        return object -> {
            ValidationResult first = this.validate(object);
            if (!first.isValid()) {
                return first;
            }
            return other.validate(object);
        };
    }

    /**
     * Combines this rule with another using OR logic.
     * Either rule passing causes the combined rule to pass.
     */
    default ValidationRule<T> or(ValidationRule<T> other) {
        return object -> {
            ValidationResult first = this.validate(object);
            if (first.isValid()) {
                return first;
            }
            return other.validate(object);
        };
    }

    /**
     * Negates this rule (logical NOT).
     */
    default ValidationRule<T> negate() {
        return object -> {
            ValidationResult result = this.validate(object);
            return result.isValid()
                ? ValidationResult.failure("Negation of: " + name())
                : ValidationResult.success();
        };
    }

    /**
     * Creates a validation rule from a Java Predicate.
     *
     * @param predicate The predicate to test
     * @param errorMessage Error message if predicate fails
     * @param ruleName Name of the rule
     */
    static <T> ValidationRule<T> from(Predicate<T> predicate, String errorMessage, String ruleName) {
        return new ValidationRule<T>() {
            @Override
            public ValidationResult validate(T object) {
                return predicate.test(object)
                    ? ValidationResult.success()
                    : ValidationResult.failure(errorMessage);
            }

            @Override
            public String name() {
                return ruleName;
            }
        };
    }
}
```

---

#### ValidationResult

```java
package org.example.common.validation;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import lombok.Getter;

/**
 * Represents the result of a validation operation.
 * Immutable value object containing validation status and error details.
 */
@Getter
public class ValidationResult {

    private final boolean valid;
    private final List<String> errors;

    private ValidationResult(boolean valid, List<String> errors) {
        this.valid = valid;
        this.errors = Collections.unmodifiableList(new ArrayList<>(errors));
    }

    /**
     * Creates a successful validation result.
     */
    public static ValidationResult success() {
        return new ValidationResult(true, Collections.emptyList());
    }

    /**
     * Creates a failed validation result with a single error message.
     */
    public static ValidationResult failure(String error) {
        return new ValidationResult(false, List.of(error));
    }

    /**
     * Creates a failed validation result with multiple error messages.
     */
    public static ValidationResult failure(List<String> errors) {
        return new ValidationResult(false, errors);
    }

    /**
     * Combines multiple validation results using AND logic.
     * All results must be valid for the combined result to be valid.
     */
    public static ValidationResult combine(List<ValidationResult> results) {
        List<String> allErrors = new ArrayList<>();
        boolean allValid = true;

        for (ValidationResult result : results) {
            if (!result.isValid()) {
                allValid = false;
                allErrors.addAll(result.getErrors());
            }
        }

        return allValid
            ? success()
            : failure(allErrors);
    }

    /**
     * Returns the first error message, if any.
     */
    public Optional<String> getFirstError() {
        return errors.isEmpty() ? Optional.empty() : Optional.of(errors.get(0));
    }

    /**
     * Returns a formatted error message containing all errors.
     */
    public String getErrorMessage() {
        return String.join("; ", errors);
    }

    @Override
    public String toString() {
        return valid
            ? "ValidationResult[VALID]"
            : "ValidationResult[INVALID: " + getErrorMessage() + "]";
    }
}
```

---

#### ValidationEngine<T>

```java
package org.example.common.validation;

import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;

/**
 * Generic validation engine that executes multiple validation rules
 * against a domain object and aggregates results.
 *
 * @param <T> The type of object to validate
 */
@Slf4j
public class ValidationEngine<T> {

    private final List<ValidationRule<T>> rules;
    private final boolean stopOnFirstFailure;

    private ValidationEngine(List<ValidationRule<T>> rules, boolean stopOnFirstFailure) {
        this.rules = new ArrayList<>(rules);
        this.stopOnFirstFailure = stopOnFirstFailure;
    }

    /**
     * Validates the provided object against all registered rules.
     *
     * @param object The object to validate
     * @return Aggregated ValidationResult
     */
    public ValidationResult validate(T object) {
        log.debug("Starting validation with {} rules", rules.size());

        List<ValidationResult> results = new ArrayList<>();

        for (ValidationRule<T> rule : rules) {
            log.debug("Executing rule: {}", rule.name());

            ValidationResult result = rule.validate(object);

            if (!result.isValid()) {
                log.warn("Rule failed: {} - {}", rule.name(), result.getErrorMessage());

                if (stopOnFirstFailure) {
                    return result; // Short-circuit on first failure
                }
            }

            results.add(result);
        }

        ValidationResult combined = ValidationResult.combine(results);

        log.info(
            "Validation completed: valid={}, errors={}",
            combined.isValid(),
            combined.getErrors().size()
        );

        return combined;
    }

    /**
     * Builder for constructing ValidationEngine instances.
     */
    public static <T> Builder<T> builder() {
        return new Builder<>();
    }

    public static class Builder<T> {
        private final List<ValidationRule<T>> rules = new ArrayList<>();
        private boolean stopOnFirstFailure = false;

        /**
         * Adds a validation rule to the engine.
         */
        public Builder<T> addRule(ValidationRule<T> rule) {
            this.rules.add(rule);
            return this;
        }

        /**
         * Adds multiple validation rules to the engine.
         */
        public Builder<T> addRules(List<ValidationRule<T>> rules) {
            this.rules.addAll(rules);
            return this;
        }

        /**
         * Configures the engine to stop on first validation failure.
         * Default: false (execute all rules and aggregate failures)
         */
        public Builder<T> stopOnFirstFailure(boolean stop) {
            this.stopOnFirstFailure = stop;
            return this;
        }

        /**
         * Builds the ValidationEngine.
         */
        public ValidationEngine<T> build() {
            return new ValidationEngine<>(rules, stopOnFirstFailure);
        }
    }
}
```

---

## 3. Order Validation Rules

### 3.1 Required Field Validations

```java
package org.example.oms.validation.rules.order;

import org.example.common.model.Order;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Validates that required Order fields are present and non-empty.
 */
public class OrderRequiredFieldsRule implements ValidationRule<Order> {

    @Override
    public ValidationResult validate(Order order) {
        List<String> errors = new ArrayList<>();

        if (order == null) {
            return ValidationResult.failure("Order cannot be null");
        }

        if (isBlank(order.getSymbol())) {
            errors.add("Symbol is required");
        }

        if (order.getSide() == null) {
            errors.add("Side is required");
        }

        if (isBlank(order.getAccount())) {
            errors.add("Account is required");
        }

        if (isBlank(order.getSessionId())) {
            errors.add("SessionId is required");
        }

        if (isBlank(order.getClOrdId())) {
            errors.add("ClOrdId is required");
        }

        if (order.getOrdType() == null) {
            errors.add("Order type is required");
        }

        return errors.isEmpty()
            ? ValidationResult.success()
            : ValidationResult.failure(errors);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    @Override
    public String name() {
        return "OrderRequiredFields";
    }

    @Override
    public String description() {
        return "Validates that all required order fields are present";
    }
}
```

---

### 3.2 Quantity Validation Rules

```java
package org.example.oms.validation.rules.order;

import java.math.BigDecimal;
import org.example.common.model.Order;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Validates order quantity constraints.
 */
public class OrderQuantityRule implements ValidationRule<Order> {

    @Override
    public ValidationResult validate(Order order) {
        if (order.getOrderQty() == null) {
            return ValidationResult.failure("Order quantity is required");
        }

        if (order.getOrderQty().compareTo(BigDecimal.ZERO) <= 0) {
            return ValidationResult.failure(
                "Order quantity must be positive, got: " + order.getOrderQty()
            );
        }

        // Validate reasonable upper bound (configurable per asset class)
        BigDecimal maxQty = new BigDecimal("10000000"); // 10M shares default
        if (order.getOrderQty().compareTo(maxQty) > 0) {
            return ValidationResult.failure(
                "Order quantity exceeds maximum allowed: " + maxQty
            );
        }

        return ValidationResult.success();
    }

    @Override
    public String name() {
        return "OrderQuantity";
    }
}
```

---

### 3.3 Price Validation Rules

```java
package org.example.oms.validation.rules.order;

import java.math.BigDecimal;
import org.example.common.model.OrdType;
import org.example.common.model.Order;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Validates order price based on order type.
 */
public class OrderPriceRule implements ValidationRule<Order> {

    @Override
    public ValidationResult validate(Order order) {
        OrdType ordType = order.getOrdType();

        // LIMIT orders must have a price
        if (OrdType.LIMIT == ordType || OrdType.STOP_LIMIT == ordType) {
            if (order.getPrice() == null) {
                return ValidationResult.failure(
                    "Limit orders must have a price"
                );
            }

            if (order.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                return ValidationResult.failure(
                    "Price must be positive, got: " + order.getPrice()
                );
            }
        }

        // STOP orders must have a stop price
        if (OrdType.STOP == ordType || OrdType.STOP_LIMIT == ordType) {
            if (order.getStopPx() == null) {
                return ValidationResult.failure(
                    "Stop orders must have a stop price"
                );
            }

            if (order.getStopPx().compareTo(BigDecimal.ZERO) <= 0) {
                return ValidationResult.failure(
                    "Stop price must be positive, got: " + order.getStopPx()
                );
            }
        }

        // MARKET orders should not have a price
        if (OrdType.MARKET == ordType && order.getPrice() != null) {
            return ValidationResult.failure(
                "Market orders should not specify a price"
            );
        }

        return ValidationResult.success();
    }

    @Override
    public String name() {
        return "OrderPrice";
    }
}
```

---

### 3.4 State-Based Validation Rules

```java
package org.example.oms.validation.rules.order;

import org.example.common.model.Order;
import org.example.common.model.State;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Validates that order is in an acceptable state for execution.
 */
public class OrderExecutableStateRule implements ValidationRule<Order> {

    @Override
    public ValidationResult validate(Order order) {
        State state = order.getState();

        // Only LIVE orders can accept executions
        if (state != State.LIVE) {
            return ValidationResult.failure(
                String.format(
                    "Order must be in LIVE state to accept executions, current state: %s",
                    state
                )
            );
        }

        return ValidationResult.success();
    }

    @Override
    public String name() {
        return "OrderExecutableState";
    }
}
```

---

### 3.5 Cumulative Quantity Constraint

```java
package org.example.oms.validation.rules.order;

import java.math.BigDecimal;
import org.example.common.model.Order;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Validates that cumQty does not exceed orderQty.
 */
public class OrderCumQtyConstraintRule implements ValidationRule<Order> {

    @Override
    public ValidationResult validate(Order order) {
        BigDecimal orderQty = order.getOrderQty();
        BigDecimal cumQty = order.getCumQty() != null
            ? order.getCumQty()
            : BigDecimal.ZERO;

        if (cumQty.compareTo(orderQty) > 0) {
            return ValidationResult.failure(
                String.format(
                    "Cumulative quantity (%s) exceeds order quantity (%s)",
                    cumQty, orderQty
                )
            );
        }

        return ValidationResult.success();
    }

    @Override
    public String name() {
        return "OrderCumQtyConstraint";
    }
}
```

---

## 4. Execution Validation Rules

### 4.1 Execution Required Fields

```java
package org.example.oms.validation.rules.execution;

import org.example.common.model.Execution;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Validates that required Execution fields are present.
 */
public class ExecutionRequiredFieldsRule implements ValidationRule<Execution> {

    @Override
    public ValidationResult validate(Execution execution) {
        List<String> errors = new ArrayList<>();

        if (execution == null) {
            return ValidationResult.failure("Execution cannot be null");
        }

        if (isBlank(execution.getOrderId())) {
            errors.add("OrderId is required");
        }

        if (isBlank(execution.getExecID())) {
            errors.add("ExecID is required");
        }

        if (execution.getLastQty() == null) {
            errors.add("LastQty is required");
        }

        if (execution.getLastPx() == null) {
            errors.add("LastPx is required");
        }

        return errors.isEmpty()
            ? ValidationResult.success()
            : ValidationResult.failure(errors);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    @Override
    public String name() {
        return "ExecutionRequiredFields";
    }
}
```

---

### 4.2 Execution Positive Quantities

```java
package org.example.oms.validation.rules.execution;

import java.math.BigDecimal;
import org.example.common.model.Execution;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Validates that execution quantities and prices are positive.
 */
public class ExecutionPositiveValuesRule implements ValidationRule<Execution> {

    @Override
    public ValidationResult validate(Execution execution) {
        if (execution.getLastQty().compareTo(BigDecimal.ZERO) <= 0) {
            return ValidationResult.failure(
                "LastQty must be positive, got: " + execution.getLastQty()
            );
        }

        if (execution.getLastPx().compareTo(BigDecimal.ZERO) <= 0) {
            return ValidationResult.failure(
                "LastPx must be positive, got: " + execution.getLastPx()
            );
        }

        return ValidationResult.success();
    }

    @Override
    public String name() {
        return "ExecutionPositiveValues";
    }
}
```

---

## 5. Composition Patterns

### 5.1 Combining Rules with AND

```java
// Combine multiple rules - all must pass
ValidationRule<Order> orderCreateRules = ValidationRule.<Order>builder()
    .add(new OrderRequiredFieldsRule())
    .and(new OrderQuantityRule())
    .and(new OrderPriceRule())
    .build();

ValidationResult result = orderCreateRules.validate(order);
```

---

### 5.2 Combining Rules with OR

```java
// At least one rule must pass
ValidationRule<Order> flexiblePriceRule = new OrderPriceRule()
    .or(ValidationRule.from(
        order -> order.getOrdType() == OrdType.MARKET,
        "Market orders exempt from price validation",
        "MarketOrderExemption"
    ));
```

---

### 5.3 Conditional Validation

```java
// Validate only if condition is met
ValidationRule<Order> conditionalRule = order -> {
    if (order.getOrdType() == OrdType.LIMIT) {
        return new OrderPriceRule().validate(order);
    }
    return ValidationResult.success(); // Skip validation for non-limit orders
};
```

---

## 6. Asset-Class Extensibility

### 6.1 Equity-Specific Validation

```java
package org.example.oms.validation.rules.equity;

import org.example.common.model.Order;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * Equity-specific validation rules.
 */
public class EquityOrderRule implements ValidationRule<Order> {

    @Override
    public ValidationResult validate(Order order) {
        List<String> errors = new ArrayList<>();

        // Equity orders must be in round lots (multiple of 100 for US equities)
        if (order.getOrderQty().remainder(new BigDecimal("100"))
                .compareTo(BigDecimal.ZERO) != 0) {
            errors.add("Equity orders must be in round lots (multiples of 100)");
        }

        // Symbol format validation (e.g., AAPL, MSFT)
        if (!order.getSymbol().matches("^[A-Z]{1,5}$")) {
            errors.add("Invalid equity symbol format: " + order.getSymbol());
        }

        return errors.isEmpty()
            ? ValidationResult.success()
            : ValidationResult.failure(errors);
    }

    @Override
    public String name() {
        return "EquityOrderValidation";
    }
}
```

---

### 6.2 FX-Specific Validation

```java
package org.example.oms.validation.rules.fx;

import java.math.BigDecimal;
import org.example.common.model.Order;
import org.example.common.validation.ValidationRule;
import org.example.common.validation.ValidationResult;

/**
 * FX-specific validation rules.
 */
public class FxOrderRule implements ValidationRule<Order> {

    @Override
    public ValidationResult validate(Order order) {
        List<String> errors = new ArrayList<>();

        // FX symbol format: CCY1/CCY2 (e.g., EUR/USD)
        if (!order.getSymbol().matches("^[A-Z]{3}/[A-Z]{3}$")) {
            errors.add("Invalid FX symbol format: " + order.getSymbol());
        }

        // FX orders must meet minimum notional (e.g., $10,000)
        BigDecimal notional = order.getOrderQty().multiply(
            order.getPrice() != null ? order.getPrice() : BigDecimal.ONE
        );
        BigDecimal minNotional = new BigDecimal("10000");

        if (notional.compareTo(minNotional) < 0) {
            errors.add(
                String.format(
                    "FX order notional (%s) below minimum (%s)",
                    notional, minNotional
                )
            );
        }

        return errors.isEmpty()
            ? ValidationResult.success()
            : ValidationResult.failure(errors);
    }

    @Override
    public String name() {
        return "FxOrderValidation";
    }
}
```

---

### 6.3 Validation Engine Factory

```java
package org.example.oms.validation;

import org.example.common.model.AssetClass;
import org.example.common.model.Order;
import org.example.common.validation.ValidationEngine;
import org.example.oms.validation.rules.equity.EquityOrderRule;
import org.example.oms.validation.rules.fx.FxOrderRule;
import org.example.oms.validation.rules.order.*;
import org.springframework.stereotype.Component;

/**
 * Factory for creating asset-class-specific validation engines.
 */
@Component
public class OrderValidationEngineFactory {

    /**
     * Creates a validation engine based on asset class.
     */
    public ValidationEngine<Order> createEngine(AssetClass assetClass) {
        ValidationEngine.Builder<Order> builder = ValidationEngine.<Order>builder()
            .addRule(new OrderRequiredFieldsRule())
            .addRule(new OrderQuantityRule())
            .addRule(new OrderPriceRule())
            .stopOnFirstFailure(false); // Collect all errors

        // Add asset-class-specific rules
        switch (assetClass) {
            case EQUITY:
                builder.addRule(new EquityOrderRule());
                break;
            case FX:
                builder.addRule(new FxOrderRule());
                break;
            case FIXED_INCOME:
                // Add fixed income specific rules
                break;
            default:
                // Use base rules only
        }

        return builder.build();
    }

    /**
     * Creates a validation engine for execution validation.
     */
    public ValidationEngine<Order> createExecutionValidationEngine() {
        return ValidationEngine.<Order>builder()
            .addRule(new OrderExecutableStateRule())
            .addRule(new OrderCumQtyConstraintRule())
            .stopOnFirstFailure(true) // Fail fast for execution validation
            .build();
    }
}
```

---

## 7. Integration with Task Pipeline

### 7.1 Refactored ValidateOrderTask

```java
package org.example.oms.service.command.tasks;

import org.example.common.model.AssetClass;
import org.example.common.model.Order;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.common.validation.ValidationEngine;
import org.example.common.validation.ValidationResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.validation.OrderValidationEngineFactory;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Validates order using the predicate-based validation engine.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ValidateOrderTask implements Task<OrderTaskContext> {

    private final OrderValidationEngineFactory validationFactory;

    @Override
    public TaskResult execute(OrderTaskContext context) {
        log.debug("Validating order using validation engine");

        Order order = context.getOrder();
        if (order == null) {
            return TaskResult.failed(getName(), "Order is null");
        }

        // Determine asset class (default to EQUITY if not specified)
        AssetClass assetClass = determineAssetClass(order);

        // Create asset-class-specific validation engine
        ValidationEngine<Order> engine = validationFactory.createEngine(assetClass);

        // Execute validation
        ValidationResult result = engine.validate(order);

        if (!result.isValid()) {
            log.warn(
                "Order validation failed for clOrdId={}: {}",
                order.getClOrdId(),
                result.getErrorMessage()
            );

            context.markValidationFailed(result.getErrorMessage());
            return TaskResult.failed(getName(), result.getErrorMessage());
        }

        log.info("Order validation passed for clOrdId={}", order.getClOrdId());
        return TaskResult.success(getName(), "Order validation passed");
    }

    private AssetClass determineAssetClass(Order order) {
        // Determine asset class from symbol, securityType, or other fields
        // Default to EQUITY for now
        return AssetClass.EQUITY;
    }

    @Override
    public int getOrder() {
        return 100; // Execute early in the pipeline
    }
}
```

---

### 7.2 Refactored ValidateExecutionTask

```java
package org.example.oms.service.execution.tasks;

import org.example.common.model.Execution;
import org.example.common.orchestration.Task;
import org.example.common.orchestration.TaskResult;
import org.example.common.validation.ValidationEngine;
import org.example.common.validation.ValidationResult;
import org.example.oms.model.OrderTaskContext;
import org.example.oms.validation.rules.execution.ExecutionPositiveValuesRule;
import org.example.oms.validation.rules.execution.ExecutionRequiredFieldsRule;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

/**
 * Validates execution using the predicate-based validation engine.
 */
@Component
@Slf4j
public class ValidateExecutionTask implements Task<OrderTaskContext> {

    private final ValidationEngine<Execution> validationEngine;

    public ValidateExecutionTask() {
        this.validationEngine = ValidationEngine.<Execution>builder()
            .addRule(new ExecutionRequiredFieldsRule())
            .addRule(new ExecutionPositiveValuesRule())
            .stopOnFirstFailure(true)
            .build();
    }

    @Override
    public TaskResult execute(OrderTaskContext context) {
        log.debug("Validating execution using validation engine");

        if (!context.hasExecution()) {
            return TaskResult.failed(getName(), "Execution is required in context");
        }

        Execution execution = context.getExecution();

        // Execute validation
        ValidationResult result = validationEngine.validate(execution);

        if (!result.isValid()) {
            log.warn(
                "Execution validation failed for execId={}: {}",
                execution.getExecID(),
                result.getErrorMessage()
            );

            return TaskResult.failed(getName(), result.getErrorMessage());
        }

        // Additional order-state validation (requires both execution and order)
        if (context.hasOrder()) {
            ValidationEngine<Order> orderStateEngine =
                new OrderValidationEngineFactory().createExecutionValidationEngine();

            ValidationResult orderStateResult = orderStateEngine.validate(context.getOrder());

            if (!orderStateResult.isValid()) {
                return TaskResult.failed(getName(), orderStateResult.getErrorMessage());
            }
        }

        log.info("Execution validation passed for execId={}", execution.getExecID());
        return TaskResult.success(getName(), "Execution validation passed");
    }

    @Override
    public int getOrder() {
        return 100; // Execute early in the pipeline
    }
}
```

---

## 8. Configuration and Extensibility

### 8.1 Rule Configuration

```java
package org.example.oms.validation.config;

import java.math.BigDecimal;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import lombok.Data;

/**
 * Configuration properties for validation rules.
 */
@Configuration
@ConfigurationProperties(prefix = "oms.validation")
@Data
public class ValidationConfigProperties {

    /**
     * Maximum allowed order quantity.
     */
    private BigDecimal maxOrderQty = new BigDecimal("10000000");

    /**
     * Minimum FX notional value.
     */
    private BigDecimal minFxNotional = new BigDecimal("10000");

    /**
     * Equity round lot size.
     */
    private int equityRoundLot = 100;

    /**
     * Enable strict validation mode.
     */
    private boolean strictMode = true;
}
```

**application.yml:**
```yaml
oms:
  validation:
    max-order-qty: 10000000
    min-fx-notional: 10000
    equity-round-lot: 100
    strict-mode: true
```

---

### 8.2 Custom Rule Registration

```java
package org.example.oms.validation.config;

import org.example.common.model.Order;
import org.example.common.validation.ValidationRule;
import org.example.oms.validation.rules.custom.ComplianceRule;
import org.example.oms.validation.rules.custom.RiskLimitRule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration for registering custom validation rules.
 */
@Configuration
public class CustomValidationRulesConfig {

    @Bean
    public ValidationRule<Order> complianceRule() {
        return new ComplianceRule();
    }

    @Bean
    public ValidationRule<Order> riskLimitRule() {
        return new RiskLimitRule();
    }
}
```

---

## 9. Testing Validation Rules

### 9.1 Unit Test Example

```java
package org.example.oms.validation.rules.order;

import java.math.BigDecimal;
import org.example.common.model.Order;
import org.example.common.validation.ValidationResult;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class OrderQuantityRuleTest {

    private final OrderQuantityRule rule = new OrderQuantityRule();

    @Test
    void shouldPassWhenQuantityIsPositive() {
        // Given
        Order order = Order.builder()
            .orderQty(new BigDecimal("1000"))
            .build();

        // When
        ValidationResult result = rule.validate(order);

        // Then
        assertThat(result.isValid()).isTrue();
    }

    @Test
    void shouldFailWhenQuantityIsZero() {
        // Given
        Order order = Order.builder()
            .orderQty(BigDecimal.ZERO)
            .build();

        // When
        ValidationResult result = rule.validate(order);

        // Then
        assertThat(result.isValid()).isFalse();
        assertThat(result.getFirstError()).contains("must be positive");
    }

    @Test
    void shouldFailWhenQuantityIsNegative() {
        // Given
        Order order = Order.builder()
            .orderQty(new BigDecimal("-100"))
            .build();

        // When
        ValidationResult result = rule.validate(order);

        // Then
        assertThat(result.isValid()).isFalse();
    }

    @Test
    void shouldFailWhenQuantityExceedsMaximum() {
        // Given
        Order order = Order.builder()
            .orderQty(new BigDecimal("100000000")) // 100M
            .build();

        // When
        ValidationResult result = rule.validate(order);

        // Then
        assertThat(result.isValid()).isFalse();
        assertThat(result.getFirstError()).contains("exceeds maximum");
    }
}
```

---

### 9.2 Integration Test Example

```java
package org.example.oms.validation;

import org.example.common.model.AssetClass;
import org.example.common.model.OrdType;
import org.example.common.model.Order;
import org.example.common.model.Side;
import org.example.common.validation.ValidationEngine;
import org.example.common.validation.ValidationResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class OrderValidationEngineFactoryIntegrationTest {

    @Autowired
    private OrderValidationEngineFactory factory;

    @Test
    void shouldValidateEquityOrderSuccessfully() {
        // Given
        Order order = Order.builder()
            .symbol("AAPL")
            .side(Side.BUY)
            .orderQty(new BigDecimal("100")) // Round lot
            .ordType(OrdType.LIMIT)
            .price(new BigDecimal("150.00"))
            .account("ACC-001")
            .sessionId("SESSION-001")
            .clOrdId("CLO-001")
            .build();

        ValidationEngine<Order> engine = factory.createEngine(AssetClass.EQUITY);

        // When
        ValidationResult result = engine.validate(order);

        // Then
        assertThat(result.isValid()).isTrue();
    }

    @Test
    void shouldFailEquityOrderWithOddLot() {
        // Given
        Order order = Order.builder()
            .symbol("AAPL")
            .side(Side.BUY)
            .orderQty(new BigDecimal("150")) // Odd lot (not multiple of 100)
            .ordType(OrdType.LIMIT)
            .price(new BigDecimal("150.00"))
            .account("ACC-001")
            .sessionId("SESSION-001")
            .clOrdId("CLO-001")
            .build();

        ValidationEngine<Order> engine = factory.createEngine(AssetClass.EQUITY);

        // When
        ValidationResult result = engine.validate(order);

        // Then
        assertThat(result.isValid()).isFalse();
        assertThat(result.getErrorMessage()).contains("round lots");
    }
}
```

---

## 10. Performance Considerations

### 10.1 Rule Caching

```java
@Component
public class CachedValidationEngineFactory {

    private final Map<AssetClass, ValidationEngine<Order>> cache = new ConcurrentHashMap<>();

    public ValidationEngine<Order> getEngine(AssetClass assetClass) {
        return cache.computeIfAbsent(assetClass, this::buildEngine);
    }

    private ValidationEngine<Order> buildEngine(AssetClass assetClass) {
        // Build engine as shown in previous sections
        return ValidationEngine.<Order>builder()
            .addRule(new OrderRequiredFieldsRule())
            // ... other rules
            .build();
    }
}
```

---

### 10.2 Parallel Validation

```java
public class ParallelValidationEngine<T> {

    private final List<ValidationRule<T>> rules;
    private final ExecutorService executor;

    public ValidationResult validate(T object) {
        List<CompletableFuture<ValidationResult>> futures = rules.stream()
            .map(rule -> CompletableFuture.supplyAsync(
                () -> rule.validate(object),
                executor
            ))
            .collect(Collectors.toList());

        List<ValidationResult> results = futures.stream()
            .map(CompletableFuture::join)
            .collect(Collectors.toList());

        return ValidationResult.combine(results);
    }
}
```

---

## 11. Related Documents

- [Domain Model](domain-model_spec.md) — Order and Execution entity field specifications
- [Task Orchestration Framework](task-orchestration-framework_spec.md) — Task pipeline integration patterns
- [Execution Reporting](../oms-concepts/execution-reporting.md) — Execution validation in processing pipeline
- [Order Lifecycle](../oms-concepts/order-lifecycle.md) — State-based validation rules
- [Order Replace](../oms-concepts/order-replace.md) — Validation for replace/cancel operations

---

## 12. Implementation Checklist

### Phase 1: Core Framework
- [x] Define ValidationRule interface
- [x] Implement ValidationResult value object
- [x] Implement ValidationEngine with builder pattern
- [ ] Add unit tests for framework components

### Phase 2: Order Validation Rules
- [x] OrderRequiredFieldsRule
- [x] OrderQuantityRule
- [x] OrderPriceRule
- [x] OrderExecutableStateRule
- [x] OrderCumQtyConstraintRule
- [ ] Add unit tests for each rule

### Phase 3: Execution Validation Rules
- [x] ExecutionRequiredFieldsRule
- [x] ExecutionPositiveValuesRule
- [ ] ExecutionDuplicateDetectionRule
- [ ] Add unit tests for each rule

### Phase 4: Asset-Class Extensions
- [x] EquityOrderRule
- [x] FxOrderRule
- [ ] FixedIncomeOrderRule
- [ ] OptionsOrderRule

### Phase 5: Integration
- [x] Refactor ValidateOrderTask to use ValidationEngine
- [x] Refactor ValidateExecutionTask to use ValidationEngine
- [x] Create OrderValidationEngineFactory
- [ ] Add configuration properties
- [ ] Add integration tests

### Phase 6: Performance & Monitoring
- [ ] Implement rule caching
- [ ] Add Micrometer metrics for validation performance
- [ ] Add alerting for validation failure rates
- [ ] Performance benchmarking

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-14 | OMS Team | Initial specification |
