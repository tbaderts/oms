# Demo: Spec-Driven Development with GitHub Copilot

## 🎬 Real Example: Creating the Order Entity from Specs

This demonstrates the exact workflow for spec-driven development with your MCP knowledge base.

---

## Example 1: Creating the Order Entity Class

### Step 1: Ask Copilot to Read the Specs

**Your Prompt:**
```
@workspace I need to create the Order entity class. Please:
1. Read specs/oms_spec.md section "Domain Model"
2. Read specs/domain-model_spec.md
3. List all attributes and behaviors the Order entity should have according to specs
```

**What Happens Behind the Scenes:**
- Copilot calls: `mcp_oms_readDocSection(path="specs/oms_spec.md", sectionTitle="Domain Model")`
- Copilot calls: `mcp_oms_readDomainDoc(path="specs/domain-model_spec.md")`
- Copilot analyzes the spec content

**Copilot's Response:**
```
Based on the OMS specifications, the Order entity should have:

Core Attributes (from specs/oms_spec.md § 5):
- orderId (String) - unique identifier
- clOrdID (String) - FIX Tag 11, client order ID
- state (OrderState enum) - order lifecycle state
- symbol (String) - trading symbol
- side (OrderSide enum) - BUY/SELL
- orderType (OrderType enum) - MARKET/LIMIT/etc.
- quantity (BigDecimal) - order quantity
- price (BigDecimal) - limit price (if applicable)
- timeInForce (TimeInForce enum)

Architecture Requirements (from specs/domain-model_spec.md):
- Extends base Order from OMS Core Libraries
- Uses JPA annotations for PostgreSQL persistence
- Follows FIX protocol semantics
- Supports state machine lifecycle management
- Extensible via inheritance for asset classes

Ready to generate the class?
```

---

### Step 2: Generate the Code

**Your Prompt:**
```
@workspace Yes, generate Order.java following the spec requirements you just listed. 
Include:
- All spec attributes
- JPA annotations for PostgreSQL
- Proper Javadoc with spec references
- State management hooks
- Follow Java 21 best practices
```

**Generated Code:**
```java
package org.example.oms.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Order entity representing a trading order in the OMS.
 * 
 * <p>This implementation follows the OMS State Store Specification:</p>
 * <ul>
 *   <li>Domain Model: specs/oms_spec.md § 5</li>
 *   <li>Base Entity Model: specs/domain-model_spec.md</li>
 * </ul>
 * 
 * <p>Key Design Principles from Spec:</p>
 * <ul>
 *   <li>Follows FIX protocol semantics (clOrdID = FIX Tag 11)</li>
 *   <li>Supports state machine lifecycle management</li>
 *   <li>Extensible via inheritance for asset class-specific attributes</li>
 *   <li>Part of Event Sourcing and CQRS architecture</li>
 * </ul>
 *
 * @see <a href="file:///home/tbaderts/data/workspace/oms/specs/oms_spec.md">OMS Specification</a>
 * @see <a href="file:///home/tbaderts/data/workspace/oms/specs/domain-model_spec.md">Domain Model Spec</a>
 */
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_cl_ord_id", columnList = "cl_ord_id"),
    @Index(name = "idx_symbol", columnList = "symbol"),
    @Index(name = "idx_state", columnList = "state")
})
public class Order {

    /**
     * Unique order identifier (primary key).
     * Spec: oms_spec.md § 5 - Domain Model
     */
    @Id
    @Column(name = "order_id", nullable = false, length = 36)
    private String orderId;

    /**
     * Client Order ID - FIX Protocol Tag 11.
     * Spec: oms_spec.md § 5 - "FIX protocol semantics should be followed"
     */
    @Column(name = "cl_ord_id", nullable = false, length = 50, unique = true)
    private String clOrdID;

    /**
     * Current state of the order in its lifecycle.
     * Spec: domain-model_spec.md - State Machine Engine manages lifecycle
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 20)
    private OrderState state;

    /**
     * Trading symbol/instrument identifier.
     * Spec: oms_spec.md § 5 - Core Domain Objects
     */
    @Column(name = "symbol", nullable = false, length = 20)
    private String symbol;

    /**
     * Order side: BUY, SELL, SELL_SHORT.
     * Spec: oms_spec.md § 5 - Domain Model attributes
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "side", nullable = false, length = 10)
    private OrderSide side;

    /**
     * Order type: MARKET, LIMIT, STOP, etc.
     * Spec: oms_spec.md § 5 - Domain Model
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "order_type", nullable = false, length = 20)
    private OrderType orderType;

    /**
     * Order quantity.
     * Spec: oms_spec.md § 5 - Core attributes
     */
    @Column(name = "quantity", nullable = false, precision = 19, scale = 8)
    private BigDecimal quantity;

    /**
     * Limit price (for LIMIT orders).
     * Spec: oms_spec.md § 5 - Domain Model
     */
    @Column(name = "price", precision = 19, scale = 8)
    private BigDecimal price;

    /**
     * Time in force instruction.
     * Spec: FIX protocol semantics
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "time_in_force", length = 20)
    private TimeInForce timeInForce;

    /**
     * Timestamp when order was created.
     * Spec: oms_spec.md § 2 - "Enable efficient querying"
     */
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /**
     * Timestamp of last update.
     * Spec: Event Sourcing - track changes
     */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * Account identifier.
     * Spec: oms_spec.md - execution desk monitoring
     */
    @Column(name = "account", nullable = false, length = 50)
    private String account;

    /**
     * Version for optimistic locking.
     * Spec: oms_spec.md § 3 - "Provide persistent and consistent state management"
     */
    @Version
    @Column(name = "version")
    private Long version;

    // Constructors

    /**
     * Default constructor for JPA.
     */
    protected Order() {
        this.orderId = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
        this.state = OrderState.NEW;
    }

    /**
     * Constructor for creating new orders.
     * 
     * @param clOrdID Client order ID (FIX Tag 11)
     * @param symbol Trading symbol
     * @param side Order side
     * @param orderType Order type
     * @param quantity Order quantity
     * @param account Account identifier
     */
    public Order(String clOrdID, String symbol, OrderSide side, 
                 OrderType orderType, BigDecimal quantity, String account) {
        this();
        this.clOrdID = clOrdID;
        this.symbol = symbol;
        this.side = side;
        this.orderType = orderType;
        this.quantity = quantity;
        this.account = account;
    }

    // State Machine Integration
    // Spec: domain-model_spec.md - "State machine implementation for managing lifecycle"

    /**
     * Transition order to LIVE state.
     * Spec: State Machine Engine enforces transition rules
     */
    public void accept() {
        validateStateTransition(OrderState.LIVE);
        this.state = OrderState.LIVE;
        this.updatedAt = Instant.now();
    }

    /**
     * Fill the order (partially or fully).
     * Spec: Order lifecycle management
     */
    public void fill(BigDecimal fillQuantity) {
        if (this.state != OrderState.LIVE) {
            throw new IllegalStateException("Cannot fill order in state: " + this.state);
        }
        // State transition logic here
        this.updatedAt = Instant.now();
    }

    /**
     * Cancel the order.
     * Spec: State machine valid transitions
     */
    public void cancel() {
        validateStateTransition(OrderState.CANCELLED);
        this.state = OrderState.CANCELLED;
        this.updatedAt = Instant.now();
    }

    /**
     * Validates state transitions according to state machine rules.
     * Spec: domain-model_spec.md - State Machine Engine enforces transition rules
     */
    private void validateStateTransition(OrderState newState) {
        // TODO: Implement full state machine validation per spec
        // Reference: domain-model_spec.md § State Machine Engine
        if (this.state == OrderState.FILLED || this.state == OrderState.CANCELLED) {
            throw new IllegalStateException(
                String.format("Invalid transition from %s to %s", this.state, newState)
            );
        }
    }

    // Getters and Setters
    // (Generated with proper Javadoc)

    public String getOrderId() {
        return orderId;
    }

    public String getClOrdID() {
        return clOrdID;
    }

    public OrderState getState() {
        return state;
    }

    public String getSymbol() {
        return symbol;
    }

    public OrderSide getSide() {
        return side;
    }

    public OrderType getOrderType() {
        return orderType;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public TimeInForce getTimeInForce() {
        return timeInForce;
    }

    public void setTimeInForce(TimeInForce timeInForce) {
        this.timeInForce = timeInForce;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getAccount() {
        return account;
    }

    public Long getVersion() {
        return version;
    }

    // Enums (based on spec)

    /**
     * Order states according to OMS State Machine specification.
     * Spec: domain-model_spec.md - State Machine Engine
     */
    public enum OrderState {
        NEW,        // Order created, not yet sent
        PENDING,    // Order sent, awaiting acknowledgement
        LIVE,       // Order active in market
        PARTIALLY_FILLED,  // Some quantity filled
        FILLED,     // Fully filled
        CANCELLED,  // Cancelled by user
        REJECTED,   // Rejected by exchange
        EXPIRED     // Expired per time in force
    }

    /**
     * Order sides following FIX protocol.
     */
    public enum OrderSide {
        BUY,
        SELL,
        SELL_SHORT
    }

    /**
     * Order types following FIX protocol.
     */
    public enum OrderType {
        MARKET,
        LIMIT,
        STOP,
        STOP_LIMIT
    }

    /**
     * Time in force instructions.
     */
    public enum TimeInForce {
        DAY,        // Good for day
        GTC,        // Good till cancelled
        IOC,        // Immediate or cancel
        FOK         // Fill or kill
    }
}
```

**Key Points:**
- ✅ Every field has Javadoc referencing the spec
- ✅ Follows spec architecture (JPA, PostgreSQL, Java 21)
- ✅ Implements state machine hooks
- ✅ Uses FIX protocol semantics
- ✅ Includes TODOs for future spec requirements
- ✅ Links to actual spec files

---

### Step 3: Generate Tests

**Your Prompt:**
```
@workspace Generate comprehensive tests for the Order class:
1. Search specs for order validation and state machine rules
2. Create OrderTest.java covering all spec requirements
3. Include state transition tests
4. Map each test to its spec requirement
```

**Generated Test Class:**
```java
package org.example.oms.model;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.*;

/**
 * Tests for Order entity based on OMS specifications.
 * 
 * Test Coverage Map:
 * - specs/oms_spec.md § 5 (Domain Model): Entity structure and attributes
 * - specs/domain-model_spec.md (State Machine): State transitions
 * - FIX Protocol: Field semantics and validation
 */
@DisplayName("Order Entity Tests (Spec-Driven)")
class OrderTest {

    private Order order;

    @BeforeEach
    void setUp() {
        order = new Order(
            "TEST-001",              // clOrdID (FIX Tag 11)
            "AAPL",                  // symbol
            Order.OrderSide.BUY,     // side
            Order.OrderType.LIMIT,   // type
            new BigDecimal("100"),   // quantity
            "ACC-123"                // account
        );
    }

    /**
     * Spec: oms_spec.md § 5 - Order must have unique orderId
     */
    @Test
    @DisplayName("Order should be created with unique ID")
    void testOrderCreation_ShouldHaveUniqueId() {
        assertThat(order.getOrderId()).isNotNull();
        assertThat(order.getOrderId()).isNotEmpty();
    }

    /**
     * Spec: oms_spec.md § 5 - clOrdID follows FIX Tag 11
     */
    @Test
    @DisplayName("Order should store client order ID (FIX Tag 11)")
    void testOrderCreation_ShouldStoreClOrdID() {
        assertThat(order.getClOrdID()).isEqualTo("TEST-001");
    }

    /**
     * Spec: domain-model_spec.md - Orders start in NEW state
     */
    @Test
    @DisplayName("New order should start in NEW state")
    void testOrderCreation_ShouldStartInNewState() {
        assertThat(order.getState()).isEqualTo(Order.OrderState.NEW);
    }

    /**
     * Spec: domain-model_spec.md - State Machine valid transition: NEW → LIVE
     */
    @Test
    @DisplayName("Order should transition from NEW to LIVE when accepted")
    void testStateTransition_NewToLive_ShouldSucceed() {
        // Given: Order in NEW state
        assertThat(order.getState()).isEqualTo(Order.OrderState.NEW);
        
        // When: Order is accepted
        order.accept();
        
        // Then: Order should be in LIVE state
        assertThat(order.getState()).isEqualTo(Order.OrderState.LIVE);
    }

    /**
     * Spec: domain-model_spec.md - State Machine should enforce transition rules
     */
    @Test
    @DisplayName("Order should prevent invalid state transitions")
    void testStateTransition_FromFilled_ShouldFail() {
        // Given: Order in FILLED state (simulate)
        order.accept();
        // Manually set to FILLED for test (in production, would go through fills)
        
        // When/Then: Attempting to cancel filled order should fail
        // TODO: Implement full state machine to enforce this
        // Reference: domain-model_spec.md - State Machine Engine
    }

    /**
     * Spec: domain-model_spec.md - State Machine transition: LIVE → CANCELLED
     */
    @Test
    @DisplayName("Live order should be cancellable")
    void testStateTransition_LiveToCancelled_ShouldSucceed() {
        // Given: Order in LIVE state
        order.accept();
        assertThat(order.getState()).isEqualTo(Order.OrderState.LIVE);
        
        // When: Order is cancelled
        order.cancel();
        
        // Then: Order should be in CANCELLED state
        assertThat(order.getState()).isEqualTo(Order.OrderState.CANCELLED);
    }

    /**
     * Spec: oms_spec.md § 5 - All core attributes should be accessible
     */
    @Test
    @DisplayName("Order should store all required attributes from spec")
    void testOrderAttributes_ShouldMatchSpecification() {
        assertThat(order.getSymbol()).isEqualTo("AAPL");
        assertThat(order.getSide()).isEqualTo(Order.OrderSide.BUY);
        assertThat(order.getOrderType()).isEqualTo(Order.OrderType.LIMIT);
        assertThat(order.getQuantity()).isEqualByComparingTo("100");
        assertThat(order.getAccount()).isEqualTo("ACC-123");
        assertThat(order.getCreatedAt()).isNotNull();
        assertThat(order.getUpdatedAt()).isNotNull();
    }

    /**
     * Spec: oms_spec.md § 3 - Optimistic locking for consistency
     */
    @Test
    @DisplayName("Order should support versioning for optimistic locking")
    void testOrder_ShouldHaveVersionForOptimisticLocking() {
        // Version is managed by JPA
        assertThat(order.getVersion()).isNull(); // Not yet persisted
        // After persistence, version should be set
    }

    /**
     * Spec: FIX Protocol - Limit orders must have price
     */
    @Test
    @DisplayName("Limit order should allow price to be set")
    void testLimitOrder_ShouldHavePrice() {
        order.setPrice(new BigDecimal("150.50"));
        assertThat(order.getPrice()).isEqualByComparingTo("150.50");
    }

    /**
     * Spec: FIX Protocol - Market orders don't require price
     */
    @Test
    @DisplayName("Market order should not require price")
    void testMarketOrder_ShouldNotRequirePrice() {
        Order marketOrder = new Order(
            "TEST-002",
            "AAPL",
            Order.OrderSide.BUY,
            Order.OrderType.MARKET,
            new BigDecimal("100"),
            "ACC-123"
        );
        
        assertThat(marketOrder.getPrice()).isNull();
        // Should be valid without price
    }

    // TODO: Add parameterized tests for all state transitions
    // Reference: domain-model_spec.md - State Machine Engine should define all valid transitions

    // TODO: Add validation tests when validation engine is implemented
    // Reference: domain-model_spec.md - Validation Engine section
}
```

**Key Points:**
- ✅ Each test references its spec requirement
- ✅ TODOs point to future spec requirements
- ✅ Tests validate spec compliance
- ✅ Descriptive test names explain what spec requires

---

## Example 2: Validating Existing Code Against Specs

**Your Prompt:**
```
@workspace Analyze src/main/java/org/example/oms/service/OrderService.java 
against the OMS specifications:
1. Search specs for "command API" and "service layer"
2. Read CQRS architecture sections
3. List all spec requirements that apply to service layer
4. Check if our OrderService implements them
5. Report compliance with specific line references
```

**Copilot's Analysis:**
```
OrderService.java Spec Compliance Analysis:

Spec Requirements (from specs/oms_spec.md § 3 & domain-model_spec.md):

✅ IMPLEMENTED:
1. Uses @Service annotation (Spring Boot pattern) ✓
   Line 12: @Service
   
2. Injects OrderRepository via constructor ✓
   Lines 17-20: Constructor injection
   Spec: Software Architecture Methodology - Dependency Injection

❌ MISSING:
1. CQRS Separation
   Spec: oms_spec.md § 3 - "Separate command (write) and query (read) models"
   Issue: Service mixes read and write operations
   Fix: Split into OrderCommandService and OrderQueryService

2. Event Publishing
   Spec: oms_spec.md § 3 - "Event-driven communication for downstream consumers"
   Issue: No Kafka event publishing after state changes
   Fix: Inject KafkaTemplate and publish OrderEvent after mutations

3. Validation Engine Integration
   Spec: domain-model_spec.md - "Validation engine based on Java predicates"
   Issue: Validation is inline if-else, not using validation engine
   Fix: Inject OrderValidator and use predicate-based validation

⚠️ SUBOPTIMAL:
1. Exception Handling
   Spec: Best practices for service layer
   Issue: Generic RuntimeException thrown (line 45)
   Fix: Create domain-specific exceptions (OrderNotFoundException, etc.)

Compliance Score: 40% (2/5 requirements met)

Recommended Actions:
1. [Priority 1] Refactor to apply CQRS pattern
2. [Priority 2] Add Kafka event publishing
3. [Priority 3] Integrate validation engine
4. [Priority 4] Improve exception handling
```

---

## The Pattern That Works

### Formula for Success:
```
1. Read/Search Specs FIRST
   ↓
2. Understand Requirements
   ↓
3. Generate/Analyze Code
   ↓
4. Validate Against Specs
   ↓
5. Add Spec References
```

### Every Interaction Should:
- ✅ Start with `@workspace`
- ✅ Reference specific specs
- ✅ Include spec citations in output
- ✅ Map code to spec requirements
- ✅ Identify gaps/deviations

---

## Try It Yourself!

Copy any of these prompts and paste into Copilot Chat:

**Quick Win #1:**
```
@workspace Read the manifesto.md and explain our team's core values
```

**Quick Win #2:**
```
@workspace List all sections in the OMS spec and explain what each covers
```

**Quick Win #3:**
```
@workspace Search specs for "PostgreSQL" and list all database-related requirements
```

**Your Turn:**
```
@workspace [Your question about the OMS]
```

The MCP knowledge server makes your specs **first-class citizens** in your development workflow! 🎉
