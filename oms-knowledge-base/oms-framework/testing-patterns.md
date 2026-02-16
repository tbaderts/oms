# Testing Patterns Specification

**Version:** 1.0
**Last Updated:** 2026-02-16
**Status:** Complete

---

## Related Documents

- [Domain Model Specification](domain-model_spec.md) - Entity models used in tests
- [Task Orchestration Framework](task-orchestration-framework_spec.md) - Testing task pipelines
- [State Machine Framework](state-machine-framework_spec.md) - Testing state transitions
- [OpenAPI Contracts](openapi-contracts.md) - Testing API contracts

---

## 1. Overview

This document specifies the testing patterns and conventions used in the OMS project. The testing strategy follows a three-tier approach:

1. **Unit Tests** - Isolated component testing with mocks
2. **Integration Tests** - Multi-component testing with real dependencies
3. **End-to-End Tests** - Full workflow testing with containers

### Technology Stack

- **JUnit 5** (Jupiter) - Test framework
- **Mockito** - Mocking framework
- **Spring Boot Test** - Spring integration testing
- **Testcontainers** - Container-based integration testing
- **AssertJ** (optional) - Fluent assertions

---

## 2. Test Organization

### Directory Structure

```
oms-core/
└── src/
    └── test/
        └── java/
            └── org/
                └── example/
                    ├── common/              # Common framework tests
                    │   ├── orchestration/   # Task orchestration tests
                    │   └── state/           # State machine tests
                    └── oms/
                        ├── api/             # API controller tests
                        ├── config/          # Configuration tests
                        ├── integration/     # Integration tests
                        ├── model/           # Model/entity tests
                        └── service/         # Service layer tests
```

### Naming Conventions

- **Unit tests**: `{ClassName}Test.java`
- **Integration tests**: `{Feature}IntegrationTest.java`
- **Abstract base classes**: `Abstract{Feature}Test.java`

### Test Method Naming

Use descriptive snake_case or camelCase with clear Given-When-Then semantics:

```java
// Pattern: methodName_when{Condition}_then{ExpectedResult}
@Test
void execute_whenSessionIdMissing_returnsFailedValidation() { }

// Pattern: methodName_should{Behavior}
@Test
void handleOrderEvent_shouldDeleteOutboxAfterPublish() { }

// Pattern: test{Feature}
@Test
void testExecuteEmptyPipeline() { }
```

---

## 3. Unit Testing with JUnit 5

### Basic Structure

```java
package org.example.oms.service.command.tasks;

import static org.junit.jupiter.api.Assertions.*;

import org.example.common.model.Order;
import org.example.common.orchestration.TaskResult;
import org.example.oms.model.OrderTaskContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ValidateOrderTaskTest {

    private ValidateOrderTask task;

    @BeforeEach
    void setUp() {
        task = new ValidateOrderTask();
    }

    @Test
    void execute_whenSessionIdMissing_returnsFailedValidation() throws Exception {
        // Given: Order without sessionId
        Order order = Order.builder()
            .symbol("AAPL")
            .side(Side.BUY)
            .account("ACC-1")
            .clOrdId("CL-1")
            .ordType(OrdType.MARKET)
            .orderQty(BigDecimal.ONE)
            .build();
        OrderTaskContext context = new OrderTaskContext(order);

        // When: Task executes
        TaskResult result = task.execute(context);

        // Then: Validation fails
        assertEquals(TaskResult.Status.FAILED, result.getStatus());
        assertEquals("SessionId is required", result.getMessage());
        assertEquals("SessionId is required", context.getErrorMessage());
    }

    @Test
    void execute_whenAllFieldsValid_returnsSuccess() throws Exception {
        // Given: Valid order
        Order order = Order.builder()
            .sessionId("SESSION-1")
            .symbol("AAPL")
            .side(Side.BUY)
            .account("ACC-1")
            .clOrdId("CL-1")
            .ordType(OrdType.MARKET)
            .orderQty(BigDecimal.ONE)
            .build();
        OrderTaskContext context = new OrderTaskContext(order);

        // When: Task executes
        TaskResult result = task.execute(context);

        // Then: Validation succeeds
        assertEquals(TaskResult.Status.SUCCESS, result.getStatus());
    }
}
```

### JUnit 5 Assertions

```java
// Equality assertions
assertEquals(expected, actual);
assertEquals(expected, actual, "Custom failure message");
assertNotEquals(notExpected, actual);

// Boolean assertions
assertTrue(condition);
assertFalse(condition);

// Null assertions
assertNull(object);
assertNotNull(object);

// Exception assertions
assertThrows(IllegalArgumentException.class, () -> {
    service.methodThatThrows();
});

Exception exception = assertThrows(TaskExecutionException.class, () -> {
    task.execute(context);
});
assertEquals("Expected error message", exception.getMessage());

// Collection assertions
assertIterableEquals(expectedList, actualList);
assertArrayEquals(expectedArray, actualArray);

// Timeout assertions
assertTimeout(Duration.ofSeconds(1), () -> {
    service.performOperation();
});
```

### Parameterized Tests

```java
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

class OrderValidationTest {

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "\t", "\n"})
    void validate_whenSymbolIsBlank_shouldFail(String symbol) {
        Order order = Order.builder().symbol(symbol).build();
        ValidationResult result = validator.validate(order);
        assertFalse(result.isValid());
    }

    @ParameterizedTest
    @CsvSource({
        "BUY,  100.00, 10.00, 1000.00",
        "SELL, 50.00,  5.00,  250.00"
    })
    void calculateNotional_shouldReturnCorrectValue(
            Side side, BigDecimal price, BigDecimal qty, BigDecimal expected) {
        BigDecimal notional = calculator.calculateNotional(side, price, qty);
        assertEquals(expected, notional);
    }

    @ParameterizedTest
    @MethodSource("provideInvalidOrders")
    void validate_whenOrderInvalid_shouldReturnErrors(Order order, String expectedError) {
        ValidationResult result = validator.validate(order);
        assertFalse(result.isValid());
        assertTrue(result.getErrors().contains(expectedError));
    }

    static Stream<Arguments> provideInvalidOrders() {
        return Stream.of(
            Arguments.of(Order.builder().build(), "Symbol is required"),
            Arguments.of(Order.builder().symbol("AAPL").build(), "Side is required")
        );
    }
}
```

### Test Lifecycle Annotations

```java
import org.junit.jupiter.api.*;

class OrderServiceTest {

    @BeforeAll
    static void initAll() {
        // Runs once before all tests in this class
        System.out.println("Initializing test suite");
    }

    @BeforeEach
    void setUp() {
        // Runs before each test method
        orderRepository.deleteAll();
    }

    @AfterEach
    void tearDown() {
        // Runs after each test method
        // Cleanup resources
    }

    @AfterAll
    static void cleanUpAll() {
        // Runs once after all tests in this class
        System.out.println("Test suite complete");
    }

    @Test
    void testMethod() {
        // Test logic
    }
}
```

---

## 4. Mocking with Mockito

### Basic Mocking

```java
package org.example.oms.service;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MessagePublisherTest {

    @Mock
    private OrderOutboxRepository orderOutboxRepository;

    @Mock
    private KafkaTemplate<String, OrderMessage> kafkaTemplate;

    @Mock
    private OrderMessageMapper orderMessageMapper;

    private MessagePublisher messagePublisher;

    @BeforeEach
    void setUp() {
        // Manual instantiation with mocks
        messagePublisher = new MessagePublisher(
            orderOutboxRepository,
            kafkaTemplate,
            orderMessageMapper,
            "orders",
            true
        );
    }

    @Test
    void handleOrderEvent_whenPublishSucceeds_deletesOutboxEntry() {
        // Given: Order and outbox entry
        Order order = Order.builder().orderId("ORD-1").build();
        OrderOutbox outbox = OrderOutbox.builder().id(10L).order(order).build();
        ProcessingEvent event = ProcessingEvent.builder().orderOutbox(outbox).build();

        // Mock mapper behavior
        when(orderMessageMapper.toOrderMessage(order)).thenReturn(null);

        // Mock Kafka send with successful result
        RecordMetadata metadata = new RecordMetadata(
            new TopicPartition("orders", 0), 0L, 1, 0L, 0, 0
        );
        SendResult<String, OrderMessage> sendResult = new SendResult<>(
            new ProducerRecord<>("orders", "ORD-1", null), metadata
        );
        when(kafkaTemplate.send(eq("orders"), eq("ORD-1"), any()))
            .thenReturn(CompletableFuture.completedFuture(sendResult));

        // When: Event is handled
        messagePublisher.handleOrderEvent(event);

        // Then: Outbox entry is deleted
        verify(orderOutboxRepository).deleteById(10L);
    }

    @Test
    void handleOrderEvent_whenPublishFails_keepsOutboxEntry() {
        // Given: Order and outbox entry
        Order order = Order.builder().orderId("ORD-2").build();
        OrderOutbox outbox = OrderOutbox.builder().id(11L).order(order).build();
        ProcessingEvent event = ProcessingEvent.builder().orderOutbox(outbox).build();

        when(orderMessageMapper.toOrderMessage(order)).thenReturn(null);

        // Mock Kafka send with failed future
        CompletableFuture<SendResult<String, OrderMessage>> failed = new CompletableFuture<>();
        failed.completeExceptionally(new RuntimeException("Kafka unavailable"));
        when(kafkaTemplate.send(eq("orders"), eq("ORD-2"), any())).thenReturn(failed);

        // When: Event is handled
        messagePublisher.handleOrderEvent(event);

        // Then: Outbox entry is NOT deleted
        verify(orderOutboxRepository, never()).deleteById(11L);
    }
}
```

### Mockito Annotations

```java
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.InjectMocks;
import org.mockito.Captor;
import org.mockito.ArgumentCaptor;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private MessagePublisher messagePublisher;

    @Spy
    private OrderMapper orderMapper = new OrderMapperImpl();

    @InjectMocks  // Injects @Mock/@Spy dependencies automatically
    private OrderService orderService;

    @Captor
    private ArgumentCaptor<Order> orderCaptor;

    @Test
    void testWithCaptor() {
        orderService.createOrder(new CreateOrderRequest());

        verify(orderRepository).save(orderCaptor.capture());
        Order capturedOrder = orderCaptor.getValue();
        assertEquals("AAPL", capturedOrder.getSymbol());
    }
}
```

### Stubbing Patterns

```java
// Basic stubbing
when(repository.findById(1L)).thenReturn(Optional.of(order));

// Multiple calls with different results
when(service.getNextId())
    .thenReturn(1L)
    .thenReturn(2L)
    .thenReturn(3L);

// Conditional stubbing with argument matchers
when(repository.findBySymbol(eq("AAPL"))).thenReturn(orders);
when(repository.findBySymbol(anyString())).thenReturn(emptyList());

// Throw exception
when(repository.save(any())).thenThrow(new DataAccessException("DB error"));

// Answer for complex logic
when(calculator.calculate(any())).thenAnswer(invocation -> {
    Order order = invocation.getArgument(0);
    return order.getPrice().multiply(order.getOrderQty());
});

// Void method stubbing
doNothing().when(publisher).publish(any());
doThrow(new RuntimeException()).when(publisher).publish(any());
```

### Verification Patterns

```java
// Basic verification
verify(repository).save(order);

// Verify with argument matcher
verify(repository).save(argThat(o -> o.getSymbol().equals("AAPL")));

// Verify number of invocations
verify(repository, times(1)).save(any());
verify(repository, times(3)).findById(anyLong());
verify(repository, atLeastOnce()).findAll();
verify(repository, atMost(5)).save(any());
verify(repository, never()).delete(any());

// Verify no interactions
verifyNoInteractions(repository);

// Verify no more interactions (after previous verifications)
verify(repository).save(order);
verifyNoMoreInteractions(repository);

// Verify order of invocations
InOrder inOrder = inOrder(repository, publisher);
inOrder.verify(repository).save(order);
inOrder.verify(publisher).publish(any());

// Argument captor
ArgumentCaptor<Order> captor = ArgumentCaptor.forClass(Order.class);
verify(repository).save(captor.capture());
assertEquals("AAPL", captor.getValue().getSymbol());
```

---

## 5. Spring Boot Integration Testing

### Basic Integration Test

```java
package org.example.oms.integration;

import static org.junit.jupiter.api.Assertions.*;

import org.example.oms.OmsApplication;
import org.example.oms.repository.OrderRepository;
import org.example.oms.service.command.OrderAcceptCommandProcessor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
class OrderLifecycleIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("oms")
        .withUsername("oms")
        .withPassword("oms");

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.write.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.write.username", postgres::getUsername);
        registry.add("spring.datasource.write.password", postgres::getPassword);
        registry.add("spring.datasource.read.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.read.username", postgres::getUsername);
        registry.add("spring.datasource.read.password", postgres::getPassword);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("kafka.enabled", () -> "false");
    }

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderAcceptCommandProcessor orderAcceptCommandProcessor;

    @BeforeEach
    void setup() {
        orderRepository.deleteAll();
    }

    @Test
    void orderAccept_shouldTransitionFromUnackToLive() {
        // Given: Order in UNACK state
        Order order = orderRepository.save(Order.builder()
            .orderId("ORD-1")
            .clOrdId("CL-1")
            .account("ACCT-1")
            .symbol("AAPL")
            .state(State.UNACK)
            .build());

        // When: Accept command is processed
        var result = orderAcceptCommandProcessor.process(
            new OrderAcceptCmd("ORD-1", "OrderAcceptCmd")
        );

        // Then: Order transitions to LIVE
        assertTrue(result.isSuccess());
        Optional<Order> updated = orderRepository.findByOrderId("ORD-1");
        assertTrue(updated.isPresent());
        assertEquals(State.LIVE, updated.get().getState());
    }
}
```

### Spring Boot Test Annotations

```java
// Full application context
@SpringBootTest
class FullContextTest { }

// With specific configuration
@SpringBootTest(classes = {OmsApplication.class, TestConfig.class})
class CustomConfigTest { }

// With web environment
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class WebIntegrationTest { }

// Test specific slices
@DataJpaTest  // JPA components only
class RepositoryTest { }

@WebMvcTest(OrderController.class)  // Web layer only
class ControllerTest { }

@JsonTest  // JSON serialization only
class JsonMappingTest { }
```

### Test Configuration

```java
@TestConfiguration
public class TestConfig {

    @Bean
    @Primary  // Override production bean
    public OrderService testOrderService() {
        return new OrderServiceTestImpl();
    }

    @Bean
    public TestDataBuilder testDataBuilder() {
        return new TestDataBuilder();
    }
}
```

---

## 6. Testcontainers Integration

### Abstract Base Class Pattern

```java
package org.example.oms.integration;

import org.example.oms.OmsApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(classes = OmsApplication.class)
@Testcontainers
abstract class AbstractKafkaPostgresIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("oms")
        .withUsername("oms")
        .withPassword("oms");

    @Container
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("confluentinc/cp-kafka:7.9.3")
    );

    @DynamicPropertySource
    static void registerCommonProperties(DynamicPropertyRegistry registry) {
        // PostgreSQL properties
        registry.add("spring.datasource.write.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.write.username", postgres::getUsername);
        registry.add("spring.datasource.write.password", postgres::getPassword);
        registry.add("spring.datasource.read.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.read.username", postgres::getUsername);
        registry.add("spring.datasource.read.password", postgres::getPassword);

        // Hibernate properties
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");

        // Kafka properties
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        registry.add("spring.kafka.consumer.properties.schema.registry.url", () -> "mock://oms-it");
        registry.add("spring.kafka.producer.properties.schema.registry.url", () -> "mock://oms-it");
        registry.add("kafka.enabled", () -> "true");
        registry.add("kafka.command-topic", () -> "commands");
        registry.add("kafka.order-topic", () -> "orders");
    }
}
```

### Concrete Test Using Base Class

```java
package org.example.oms.integration;

import org.example.oms.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class CommandListenerKafkaIntegrationTest extends AbstractKafkaPostgresIntegrationTest {

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private KafkaTemplate<String, CommandMessage> kafkaTemplate;

    @Test
    void kafkaListener_shouldProcessOrderCommand() throws Exception {
        // Given: Command message
        CommandMessage message = CommandMessage.builder()
            .commandType("ORDER_CREATE")
            .payload("{\"orderId\":\"ORD-1\"}")
            .build();

        // When: Message is sent to Kafka
        kafkaTemplate.send("commands", "ORD-1", message).get();

        // Then: Order is created (wait for async processing)
        await().atMost(5, TimeUnit.SECONDS).until(() ->
            orderRepository.findByOrderId("ORD-1").isPresent()
        );
    }
}
```

### Supported Containers

```java
// PostgreSQL
@Container
static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
    .withDatabaseName("testdb")
    .withUsername("user")
    .withPassword("pass")
    .withInitScript("init.sql");

// Kafka
@Container
static KafkaContainer kafka = new KafkaContainer(
    DockerImageName.parse("confluentinc/cp-kafka:7.9.3")
);

// Redis
@Container
static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine")
    .withExposedPorts(6379);

// MongoDB
@Container
static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

// LocalStack (AWS services)
@Container
static LocalStackContainer localstack = new LocalStackContainer(
    DockerImageName.parse("localstack/localstack:3.0")
).withServices(LocalStackContainer.Service.S3, LocalStackContainer.Service.SQS);
```

---

## 7. Test Data Builders

### Lombok Builder Pattern

```java
// Domain entity with Lombok @Builder
@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Order {
    private Long id;
    private String orderId;
    private String symbol;
    private Side side;
    private BigDecimal orderQty;
    private State state;
}

// Usage in tests
Order order = Order.builder()
    .orderId("ORD-1")
    .symbol("AAPL")
    .side(Side.BUY)
    .orderQty(new BigDecimal("100.00"))
    .state(State.NEW)
    .build();
```

### Test Data Builder Class

```java
public class OrderTestDataBuilder {

    public static Order defaultOrder() {
        return Order.builder()
            .orderId("ORD-" + UUID.randomUUID())
            .clOrdId("CL-" + UUID.randomUUID())
            .sessionId("SESSION-1")
            .account("ACCT-TEST")
            .symbol("AAPL")
            .side(Side.BUY)
            .ordType(OrdType.LIMIT)
            .orderQty(new BigDecimal("100.00"))
            .price(new BigDecimal("150.00"))
            .cumQty(BigDecimal.ZERO)
            .leavesQty(new BigDecimal("100.00"))
            .state(State.NEW)
            .transactTime(Instant.now())
            .build();
    }

    public static Order liveOrder() {
        return defaultOrder().toBuilder()
            .state(State.LIVE)
            .build();
    }

    public static Order filledOrder() {
        return defaultOrder().toBuilder()
            .state(State.FILLED)
            .cumQty(new BigDecimal("100.00"))
            .leavesQty(BigDecimal.ZERO)
            .build();
    }

    public static Order partiallyFilledOrder(BigDecimal filledQty) {
        BigDecimal orderQty = new BigDecimal("100.00");
        return defaultOrder().toBuilder()
            .state(State.LIVE)
            .orderQty(orderQty)
            .cumQty(filledQty)
            .leavesQty(orderQty.subtract(filledQty))
            .build();
    }
}

// Usage
@Test
void testWithBuilder() {
    Order order = OrderTestDataBuilder.liveOrder();
    // ... test logic
}
```

### Object Mother Pattern

```java
public class TestOrders {

    private static final AtomicLong ID_GENERATOR = new AtomicLong(1000);

    public static Order appleMarketBuyOrder() {
        return Order.builder()
            .orderId("ORD-" + ID_GENERATOR.incrementAndGet())
            .symbol("AAPL")
            .side(Side.BUY)
            .ordType(OrdType.MARKET)
            .orderQty(new BigDecimal("100"))
            .state(State.NEW)
            .build();
    }

    public static Order microsoftLimitSellOrder() {
        return Order.builder()
            .orderId("ORD-" + ID_GENERATOR.incrementAndGet())
            .symbol("MSFT")
            .side(Side.SELL)
            .ordType(OrdType.LIMIT)
            .price(new BigDecimal("400.00"))
            .orderQty(new BigDecimal("50"))
            .state(State.NEW)
            .build();
    }

    public static Execution executionForOrder(Order order, BigDecimal fillQty) {
        return Execution.builder()
            .executionId("EXEC-" + ID_GENERATOR.incrementAndGet())
            .orderId(order.getOrderId())
            .execID("EX-" + UUID.randomUUID())
            .lastQty(fillQty)
            .lastPx(order.getPrice())
            .build();
    }
}
```

---

## 8. Assertion Patterns

### JUnit 5 Assertions

```java
// Basic assertions
assertEquals(expected, actual);
assertNotEquals(unexpected, actual);
assertTrue(condition);
assertFalse(condition);
assertNull(value);
assertNotNull(value);
assertSame(expected, actual);  // Reference equality
assertNotSame(expected, actual);

// Collection assertions
assertIterableEquals(expectedList, actualList);
assertLinesMatch(expectedLines, actualLines);

// Exception assertions
assertThrows(IllegalArgumentException.class, () -> service.method());

Exception ex = assertThrows(TaskExecutionException.class, () -> task.execute(context));
assertEquals("Expected message", ex.getMessage());

// assertDoesNotThrow
assertDoesNotThrow(() -> service.validMethod());

// Grouped assertions (all execute even if some fail)
assertAll("Order validation",
    () -> assertEquals("AAPL", order.getSymbol()),
    () -> assertEquals(Side.BUY, order.getSide()),
    () -> assertEquals(State.LIVE, order.getState())
);
```

### Custom Assertion Methods

```java
public class OrderAssertions {

    public static void assertOrderState(Order order, State expectedState) {
        assertNotNull(order, "Order should not be null");
        assertEquals(expectedState, order.getState(),
            () -> String.format("Expected order state %s but was %s", expectedState, order.getState())
        );
    }

    public static void assertOrderQuantities(Order order,
                                              BigDecimal expectedOrderQty,
                                              BigDecimal expectedCumQty,
                                              BigDecimal expectedLeavesQty) {
        assertAll("Order quantities",
            () -> assertEquals(expectedOrderQty, order.getOrderQty(), "orderQty mismatch"),
            () -> assertEquals(expectedCumQty, order.getCumQty(), "cumQty mismatch"),
            () -> assertEquals(expectedLeavesQty, order.getLeavesQty(), "leavesQty mismatch")
        );
    }

    public static void assertTaskSuccess(TaskResult result) {
        assertEquals(TaskResult.Status.SUCCESS, result.getStatus(),
            () -> "Expected task success but got: " + result.getMessage()
        );
    }

    public static void assertTaskFailure(TaskResult result, String expectedMessage) {
        assertEquals(TaskResult.Status.FAILED, result.getStatus());
        assertTrue(result.getMessage().contains(expectedMessage),
            () -> String.format("Expected message to contain '%s' but was '%s'",
                expectedMessage, result.getMessage())
        );
    }
}

// Usage
@Test
void testOrderState() {
    Order order = service.createOrder(request);
    OrderAssertions.assertOrderState(order, State.UNACK);
    OrderAssertions.assertOrderQuantities(order,
        new BigDecimal("100"), BigDecimal.ZERO, new BigDecimal("100")
    );
}
```

---

## 9. Testing Async Operations

### CompletableFuture Testing

```java
@Test
void testAsyncOperation() throws Exception {
    CompletableFuture<Order> future = orderService.createOrderAsync(request);

    // Wait for completion
    Order order = future.get(5, TimeUnit.SECONDS);

    assertNotNull(order);
    assertEquals("AAPL", order.getSymbol());
}

@Test
void testAsyncOperationWithCallback() throws Exception {
    CompletableFuture<Order> future = orderService.createOrderAsync(request);

    AtomicReference<Order> result = new AtomicReference<>();
    CountDownLatch latch = new CountDownLatch(1);

    future.thenAccept(order -> {
        result.set(order);
        latch.countDown();
    });

    assertTrue(latch.await(5, TimeUnit.SECONDS));
    assertNotNull(result.get());
}
```

### Awaitility for Async Assertions

```java
import static org.awaitility.Awaitility.*;

@Test
void testEventualConsistency() {
    // Trigger async operation
    orderService.createOrder(request);

    // Wait for eventual consistency
    await()
        .atMost(5, TimeUnit.SECONDS)
        .pollInterval(100, TimeUnit.MILLISECONDS)
        .until(() -> orderRepository.findByOrderId("ORD-1").isPresent());

    Order order = orderRepository.findByOrderId("ORD-1").get();
    assertEquals(State.UNACK, order.getState());
}

@Test
void testKafkaMessageProcessing() {
    kafkaTemplate.send("commands", message);

    await()
        .atMost(Duration.ofSeconds(10))
        .untilAsserted(() -> {
            Optional<Order> order = orderRepository.findByOrderId("ORD-1");
            assertTrue(order.isPresent());
            assertEquals(State.LIVE, order.get().getState());
        });
}
```

---

## 10. Testing Best Practices

### Test Independence

```java
// BAD: Tests depend on execution order
@Test
void test1_createOrder() {
    orderService.create(order);  // Creates order with ID 1
}

@Test
void test2_updateOrder() {
    orderService.update(1L, updates);  // Depends on test1
}

// GOOD: Each test is independent
@Test
void createOrder_shouldPersistToDatabase() {
    Order order = orderService.create(testOrder());
    assertNotNull(order.getId());
}

@Test
void updateOrder_shouldModifyExistingOrder() {
    Order existing = orderRepository.save(testOrder());
    Order updated = orderService.update(existing.getId(), updates);
    assertEquals(updates.getSymbol(), updated.getSymbol());
}
```

### Test Readability (Given-When-Then)

```java
@Test
void executionReport_whenOrderFilled_shouldUpdateQuantities() {
    // Given: Order with 100 shares unfilled
    Order order = orderRepository.save(Order.builder()
        .orderId("ORD-1")
        .orderQty(new BigDecimal("100"))
        .cumQty(BigDecimal.ZERO)
        .leavesQty(new BigDecimal("100"))
        .state(State.LIVE)
        .build());

    // When: Execution report for full fill
    Execution execution = Execution.builder()
        .orderId("ORD-1")
        .lastQty(new BigDecimal("100"))
        .lastPx(new BigDecimal("150.00"))
        .build();
    executionProcessor.process(execution);

    // Then: Order is fully filled
    Order updated = orderRepository.findByOrderId("ORD-1").orElseThrow();
    assertEquals(State.FILLED, updated.getState());
    assertEquals(new BigDecimal("100"), updated.getCumQty());
    assertEquals(BigDecimal.ZERO, updated.getLeavesQty());
}
```

### Test Coverage Guidelines

- **Unit tests**: 80%+ coverage for service layer and business logic
- **Integration tests**: Cover critical workflows and edge cases
- **E2E tests**: Cover primary user journeys

### Performance Testing

```java
@Test
void queryOrders_shouldCompleteWithin100ms() {
    // Given: 10,000 orders in database
    List<Order> orders = IntStream.range(0, 10_000)
        .mapToObj(i -> testOrder())
        .toList();
    orderRepository.saveAll(orders);

    // When/Then: Query completes within 100ms
    assertTimeout(Duration.ofMillis(100), () -> {
        Page<Order> result = orderQueryService.search(
            Map.of("symbol", "AAPL"), 0, 50, "id,desc"
        );
        assertTrue(result.getTotalElements() > 0);
    });
}
```

---

## 11. Running Tests

### Gradle Commands

```bash
# Run all tests
./gradlew test

# Run specific test class
./gradlew test --tests OrderLifecycleIntegrationTest

# Run specific test method
./gradlew test --tests OrderLifecycleIntegrationTest.testOrderAccept

# Run tests with pattern
./gradlew test --tests '*Integration*'

# Run tests continuously
./gradlew test --continuous

# Generate test report
./gradlew test jacocoTestReport
# Report: build/reports/jacoco/test/html/index.html
```

### Test Execution Configuration

```gradle
// build.gradle
test {
    useJUnitPlatform()

    // Test logging
    testLogging {
        events "passed", "skipped", "failed"
        exceptionFormat "full"
        showStandardStreams = false
    }

    // Parallel execution
    maxParallelForks = Runtime.runtime.availableProcessors().intdiv(2) ?: 1

    // JVM args
    jvmArgs '-Xmx2g'

    // System properties
    systemProperty 'spring.profiles.active', 'test'
}
```

---

## 12. Summary

### Testing Pyramid

```
       /\
      /  \     E2E Tests (few)
     /----\    - Full workflow with containers
    /      \   - Testcontainers (Postgres + Kafka)
   /--------\
  /          \ Integration Tests (some)
 /------------\ - Spring Boot Test
/              \ - Real dependencies
----------------
  Unit Tests (many)
  - JUnit 5 + Mockito
  - Fast, isolated
```

### Key Takeaways

1. **Write unit tests first** - Fast feedback, isolated components
2. **Use builders for test data** - Consistent, readable test setup
3. **Leverage Testcontainers** - Real dependencies in integration tests
4. **Follow Given-When-Then** - Readable, maintainable tests
5. **Mock external dependencies** - Avoid network calls, focus on logic
6. **Test behavior, not implementation** - Refactor-safe tests

---

**End of Testing Patterns Specification**
