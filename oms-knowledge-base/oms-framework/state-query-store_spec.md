# State-Query Store CQRS Specification

**Version:** 1.0
**Last Updated:** 2026-02-14
**Author:** OMS Team
**Status:** Active

---

This document outlines and evaluates various approaches for implementing a read-optimized query store that is synchronized with a primary, write-optimized transaction store. This pattern is a form of Command Query Responsibility Segregation (CQRS) at the database level, aimed at optimizing performance for both write and read operations.

## 1. Azure Database for PostgreSQL Flexible Server with Logical Replication

### Architecture

```mermaid
graph TD
    subgraph "Write Path"
        App_W[Application] -->|Writes| PrimaryDB(Primary PostgreSQL DB<br/>Write-Optimized)
    end
    subgraph "Read Path"
        App_R[Application] -->|Reads| ReadReplica(Read Replica DB<br/>Query-Optimized)
    end
    PrimaryDB -->|Logical Replication| ReadReplica
```

### Concept

This is the recommended approach, leveraging PostgreSQL's built-in logical replication capabilities within the Azure Database for PostgreSQL Flexible Server. It involves a primary (write) server and one or more read replica servers.

### How it Works

-   **Primary Server (Write-Optimized):** An Azure Database for PostgreSQL Flexible Server instance is configured for high write throughput. This includes appropriate server sizing (CPU, memory, storage), using Premium SSDs, and tuning PostgreSQL parameters like `wal_level` and `synchronous_commit`. Unlogged tables can be considered for performance-critical data where durability is less of a concern.
-   **Read Replica Server(s) (Query-Optimized):** One or more read replicas are created from the primary server. These replicas are automatically synchronized using logical replication and are optimized for read operations with appropriate sizing, query-specific indexes, and read-only connections.
-   **Logical Replication Setup:** Azure's management layer simplifies the process of enabling logical replication on the primary and configuring replicas to subscribe to changes.
-   **Application Configuration:** The application is configured to direct write operations to the primary server and read operations to the read replica(s).

### Pros

-   **Managed Service:** Azure manages the replication process, simplifying setup and maintenance.
-   **Near Real-Time Replication:** Logical replication provides low-latency data synchronization.
-   **Read Scalability:** Read operations can be scaled out by adding more read replicas.
-   **Minimal Application Changes:** The pattern requires relatively few code modifications.
-   **Cost-Effective:** It is generally more cost-effective than more complex solutions.
-   **Flexible Server Advantages:** The Flexible Server deployment option offers greater control over configuration and maintenance.

### Cons

-   **Replication Lag:** A degree of replication lag is inherent, meaning read replicas may not be perfectly up-to-date. This lag should be monitored.
-   **Consistency Considerations:** The application must be designed to handle potential data inconsistencies arising from the replication lag.
-   **Write Performance Impact:** Heavy read activity on replicas can still indirectly impact the primary's write performance if they contend for shared resources.
-   **Replication Complexity:** While simplified by Azure, a proper understanding of PostgreSQL replication is still necessary for correct configuration.

## 2. Azure Database for PostgreSQL Hyperscale (Citus) with Read Replicas

### Architecture

```mermaid
graph TD
    subgraph "Application"
        App[Application]
    end
    subgraph "Citus Cluster"
        Coordinator(Coordinator Node)
        W1(Worker 1)
        W2(Worker 2)
        WN(Worker N)
        ReadReplica(Read Replica of Coordinator)
    end
    App -->|Writes| Coordinator
    App -->|Reads| ReadReplica
    Coordinator -->|Sharded Tables| W1
    Coordinator -->|Sharded Tables| W2
    Coordinator -->|Sharded Tables| WN
    Coordinator -->|Replication| ReadReplica
```

### Concept

Azure Database for PostgreSQL Hyperscale (Citus) is a distributed database that shards data across multiple nodes. Read replicas can be added to the coordinator node to scale read-heavy workloads.

### How it Works

-   **Hyperscale (Citus) Setup:** An Azure Database for PostgreSQL Hyperscale (Citus) cluster is created, and the database schema is designed for sharding across worker nodes.
-   **Coordinator Node:** This node serves as the entry point for queries, distributing them to the appropriate worker nodes.
-   **Read Replicas:** Read replicas are added to the coordinator node and are synchronized with it.
-   **Application Configuration:** The application directs write operations to the coordinator node and read operations to the read replicas of the coordinator.

### Pros

-   **High Scalability:** Citus offers excellent scalability for both read and write operations.
-   **Distributed Queries:** Queries are automatically distributed across worker nodes, improving performance.
-   **Additional Read Scalability:** Read replicas provide a further tier of read scalability.

### Cons

-   **Complexity:** Citus is more complex to set up and manage than a single PostgreSQL instance.
-   **Schema Design:** Designing a sharded database schema requires careful planning and consideration.
-   **Query Limitations:** Some complex queries may not be fully supported by Citus.
-   **Cost:** Citus can be more expensive, particularly for large clusters.
-   **Replication Lag:** Similar to logical replication, there will be a lag between the primary and replicas.

## 3. Event Sourcing + CQRS (With Separate Databases)

### Architecture

```mermaid
graph TD
    subgraph "Write Side (Commands)"
        App_W[Application] -->|Commands| EventStore(Event Store<br/>Write-Optimized PostgreSQL)
    end
    subgraph "Read Side (Queries)"
        App_R[Application] -->|Queries| QueryDB(Query Database<br/>Read-Optimized PostgreSQL)
    end
    subgraph "Projection"
        EventStore -->|Events| Projector(Event Projector Service)
        Projector -->|Updates Read Model| QueryDB
    end
```

### Concept

This approach leverages an Event Sourcing pattern to create explicitly separate databases for the command (write) and query (read) sides of the application.

### How it Works

-   **Command Database (Write-Optimized):** The existing event store serves as the source of truth and is optimized for write operations.
-   **Query Database (Read-Optimized):** A separate PostgreSQL database is created specifically for queries, containing a denormalized, read-optimized view of the data.
-   **Event Consumption and Projection:** A dedicated service or application component consumes events from the event store and projects them into the query database. This involves transforming events into the appropriate format for the read model.
-   **Application Configuration:** The application writes events to the event store and reads data from the query database.

### Pros

-   **Complete Separation:** This provides full segregation of read and write operations, allowing for independent optimization and scaling.
-   **Independent Optimization:** The command and query databases can be tailored to their specific workloads without compromise.
-   **Maximum Scalability:** This architecture offers the highest potential for scalability.

### Cons

-   **Complexity:** This is the most complex option to implement and maintain.
-   **Eventual Consistency:** The delay between an event being stored and the query database being updated can be longer than with logical replication.
-   **Increased Development Effort:** Significant development is required to build and maintain the event consumption and projection logic.
-   **Operational Overhead:** Managing multiple databases increases operational complexity.

## 4. ReadySet Caching Layer

### Architecture

```mermaid
flowchart LR
    subgraph Application
        App[Application]
    end
    subgraph "Data Layer"
        ReadySet(ReadySet Cache)
        PostgresDB(PostgreSQL DB)
    end
    App -->|Reads SQL| ReadySet
    App -->|Writes SQL| PostgresDB
    PostgresDB -->|Logical Replication Stream| ReadySet
    ReadySet -->|Cache Misses| PostgresDB
```

### Concept

ReadySet is a SQL caching engine that acts as a proxy between the application and the database. It caches query results and keeps them updated in real-time by listening to the database's replication stream.

### How it Works

-   **Proxy Layer:** ReadySet sits between your application and your PostgreSQL database.
-   **Query Caching:** It caches the results of `SELECT` queries.
-   **Real-time Updates:** ReadySet connects to the database's logical replication stream to monitor for data changes (`INSERT`, `UPDATE`, `DELETE`). When a change occurs that affects a cached query result, ReadySet automatically and incrementally updates the cache.
-   **Application Configuration:** The application connects to ReadySet instead of directly to the database for read queries. Write queries can be sent directly to the database or through ReadySet.

### Pros

-   **Transparent Caching:** Requires minimal application changes. You don't need to manage cache invalidation logic.
-   **High Performance:** Serves cached query results from memory, leading to very low-latency reads.
-   **Reduced Database Load:** Offloads read traffic from the primary database, freeing up resources for write operations.
-   **Real-time:** The cache is kept up-to-date in near real-time.

### Cons

-   **Unsupported Queries:** ReadySet may not support all SQL queries for caching, particularly those with non-deterministic functions or complex joins.
-   **Added Complexity:** Introduces another component into the architecture that needs to be managed and monitored.
-   **Cost:** ReadySet is a commercial product (with a BSL license), which adds to the overall cost of the solution.
-   **Maturity:** As a newer technology, it may not have the same level of community support or battle-tested history as native PostgreSQL replication.

## Summary

The choice of architecture depends on the specific requirements of the application, including performance needs, scalability goals, development resources, and operational capacity.

-   **Logical Replication** is a balanced and cost-effective choice for many applications.
-   **Citus** is ideal for applications requiring massive scale and distributed query performance.
-   **Event Sourcing with CQRS** provides the most flexibility and scalability but at the cost of complexity.
-   **ReadySet** offers a compelling solution for offloading read traffic with minimal application changes, but with the trade-offs of a commercial product and potential query limitations.

---

## 5. Implementation Patterns

### 5.1 PostgreSQL Logical Replication Configuration

#### Spring Boot DataSource Configuration

```java
package org.example.oms.config;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Dual DataSource configuration for CQRS pattern.
 * Write operations use primary DB, read operations use read replica.
 */
@Configuration
public class CqrsDataSourceConfig {

    /**
     * Primary (write) DataSource configuration.
     */
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.write")
    public DataSourceProperties writeDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean
    @Primary
    public DataSource writeDataSource() {
        return writeDataSourceProperties()
            .initializeDataSourceBuilder()
            .build();
    }

    /**
     * Read replica DataSource configuration.
     */
    @Bean
    @ConfigurationProperties("spring.datasource.read")
    public DataSourceProperties readDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean
    public DataSource readDataSource() {
        return readDataSourceProperties()
            .initializeDataSourceBuilder()
            .build();
    }

    /**
     * JdbcTemplate for read operations (queries).
     */
    @Bean
    public JdbcTemplate readJdbcTemplate(@Qualifier("readDataSource") DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }
}
```

**application.yml:**

```yaml
spring:
  datasource:
    write:
      url: jdbc:postgresql://primary-db.postgres.database.azure.com:5432/oms
      username: ${WRITE_DB_USER}
      password: ${WRITE_DB_PASSWORD}
      hikari:
        maximum-pool-size: 20
        minimum-idle: 5

    read:
      url: jdbc:postgresql://read-replica-db.postgres.database.azure.com:5432/oms
      username: ${READ_DB_USER}
      password: ${READ_DB_PASSWORD}
      hikari:
        maximum-pool-size: 50  # Higher for read-heavy workload
        minimum-idle: 10
        read-only: true
```

---

#### Routing DataSource for Automatic Read/Write Splitting

```java
package org.example.oms.config;

import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Routes queries to read replica or write primary based on transaction context.
 */
public class ReadWriteRoutingDataSource extends AbstractRoutingDataSource {

    @Override
    protected Object determineCurrentLookupKey() {
        // Read-only transactions go to read replica
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
            ? "read"
            : "write";
    }
}
```

**Configuration:**

```java
@Bean
public DataSource routingDataSource(
        @Qualifier("writeDataSource") DataSource writeDataSource,
        @Qualifier("readDataSource") DataSource readDataSource) {

    ReadWriteRoutingDataSource routingDataSource = new ReadWriteRoutingDataSource();

    Map<Object, Object> targetDataSources = new HashMap<>();
    targetDataSources.put("write", writeDataSource);
    targetDataSources.put("read", readDataSource);

    routingDataSource.setTargetDataSources(targetDataSources);
    routingDataSource.setDefaultTargetDataSource(writeDataSource);

    return routingDataSource;
}
```

**Usage:**

```java
@Service
@RequiredArgsConstructor
public class OrderQueryService {

    private final OrderRepository orderRepository;

    /**
     * Read-only queries automatically routed to read replica.
     */
    @Transactional(readOnly = true)
    public List<Order> findLiveOrders() {
        return orderRepository.findByState(State.LIVE);
    }
}
```

---

#### Replication Lag Monitoring

```java
package org.example.oms.monitoring;

import java.sql.ResultSet;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Monitors replication lag between primary and read replica.
 * Publishes metrics to Prometheus for alerting.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ReplicationLagMonitor {

    private final JdbcTemplate readJdbcTemplate;
    private final MeterRegistry meterRegistry;

    /**
     * Checks replication lag every 30 seconds.
     */
    @Scheduled(fixedRate = 30000)
    public void monitorReplicationLag() {
        try {
            Long lagBytes = readJdbcTemplate.queryForObject(
                "SELECT pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())",
                Long.class
            );

            if (lagBytes != null) {
                // Record lag in bytes
                meterRegistry.gauge(
                    "postgres.replication.lag.bytes",
                    Tags.of("replica", "read"),
                    lagBytes
                );

                if (lagBytes > 10_000_000) { // 10MB threshold
                    log.warn("High replication lag detected: {} bytes", lagBytes);
                }
            }
        } catch (Exception e) {
            log.error("Failed to monitor replication lag", e);
        }
    }
}
```

---

### 5.2 ReadySet Integration Patterns

#### ReadySet Setup

**Docker Compose (Development):**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: oms
      POSTGRES_USER: oms_user
      POSTGRES_PASSWORD: oms_password
      # Enable logical replication
      POSTGRES_HOST_AUTH_METHOD: trust
    command:
      - "postgres"
      - "-c"
      - "wal_level=logical"
      - "-c"
      - "max_replication_slots=10"
      - "-c"
      - "max_wal_senders=10"
    ports:
      - "5432:5432"

  readyset:
    image: public.ecr.aws/readyset/readyset:latest
    platform: linux/amd64
    environment:
      DEPLOYMENT_ENV: quickstart_docker
      DB_DIR: /state
      PROMETHEUS_METRICS: true
      QUERY_CACHING: explicit
      UPSTREAM_DB_URL: postgresql://oms_user:oms_password@postgres:5432/oms
      CONTROLLER_ADDRESS: 0.0.0.0:6033
    ports:
      - "5433:5433"  # ReadySet SQL port
      - "6033:6033"  # ReadySet metrics port
    depends_on:
      - postgres
    volumes:
      - readyset-data:/state

volumes:
  readyset-data:
```

---

#### Spring Boot ReadySet Configuration

```java
package org.example.oms.config;

import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.zaxxer.hikari.HikariDataSource;

/**
 * ReadySet DataSource configuration.
 * Queries go through ReadySet cache layer for performance.
 */
@Configuration
public class ReadySetConfig {

    @Bean
    @ConfigurationProperties("spring.datasource.readyset")
    public DataSourceProperties readySetDataSourceProperties() {
        return new DataSourceProperties();
    }

    /**
     * DataSource pointing to ReadySet proxy (port 5433).
     */
    @Bean
    public DataSource readySetDataSource() {
        HikariDataSource dataSource = readySetDataSourceProperties()
            .initializeDataSourceBuilder()
            .type(HikariDataSource.class)
            .build();

        // ReadySet-specific connection settings
        dataSource.addDataSourceProperty("prepareThreshold", "0");
        dataSource.setConnectionTimeout(5000);

        return dataSource;
    }
}
```

**application.yml:**

```yaml
spring:
  datasource:
    # Primary database (writes)
    write:
      url: jdbc:postgresql://localhost:5432/oms
      username: oms_user
      password: oms_password

    # ReadySet cache layer (reads)
    readyset:
      url: jdbc:postgresql://localhost:5433/oms
      username: oms_user
      password: oms_password
      hikari:
        maximum-pool-size: 50
        read-only: true
```

---

#### ReadySet Cache Preparation

ReadySet requires explicit cache preparation for queries:

```java
package org.example.oms.config;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Prepares ReadySet caches for frequently-used queries.
 * Run once at application startup.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ReadySetCacheInitializer implements CommandLineRunner {

    private final JdbcTemplate readySetJdbcTemplate;

    @Override
    public void run(String... args) {
        log.info("Initializing ReadySet caches...");

        // Cache: Find orders by state
        prepareCacheForQuery(
            "find_orders_by_state",
            "SELECT * FROM orders WHERE state = ?"
        );

        // Cache: Find orders by symbol and state
        prepareCacheForQuery(
            "find_orders_by_symbol_state",
            "SELECT * FROM orders WHERE symbol = ? AND state = ?"
        );

        // Cache: Find order by orderId
        prepareCacheForQuery(
            "find_order_by_id",
            "SELECT * FROM orders WHERE order_id = ?"
        );

        // Cache: Aggregate query for trade blotter
        prepareCacheForQuery(
            "order_summary_by_account",
            "SELECT account, state, COUNT(*), SUM(order_qty), SUM(cum_qty) " +
            "FROM orders " +
            "WHERE creation_date >= CURRENT_DATE " +
            "GROUP BY account, state"
        );

        log.info("ReadySet cache initialization complete");
    }

    private void prepareCacheForQuery(String cacheName, String sql) {
        try {
            // Create cache in ReadySet
            readySetJdbcTemplate.execute(
                String.format("CREATE CACHE %s FROM %s", cacheName, sql)
            );
            log.info("Created ReadySet cache: {}", cacheName);
        } catch (Exception e) {
            log.warn("Failed to create cache {}: {}", cacheName, e.getMessage());
        }
    }
}
```

**ReadySet Cache Management:**

```java
@Service
@RequiredArgsConstructor
public class ReadySetCacheService {

    private final JdbcTemplate readySetJdbcTemplate;

    /**
     * Show all ReadySet caches.
     */
    public List<CacheInfo> listCaches() {
        return readySetJdbcTemplate.query(
            "SHOW CACHES",
            (rs, rowNum) -> CacheInfo.builder()
                .name(rs.getString("name"))
                .query(rs.getString("query"))
                .fallbackBehavior(rs.getString("fallback_behavior"))
                .build()
        );
    }

    /**
     * Drop a specific cache.
     */
    public void dropCache(String cacheName) {
        readySetJdbcTemplate.execute(
            String.format("DROP CACHE %s", cacheName)
        );
    }

    /**
     * Check if query is cached.
     */
    public boolean isQueryCached(String sql) {
        String explainResult = readySetJdbcTemplate.queryForObject(
            "EXPLAIN " + sql,
            String.class
        );
        return explainResult != null && explainResult.contains("Cached");
    }
}
```

---

#### ReadySet Query Service

```java
package org.example.oms.service;

import java.util.List;
import org.example.common.model.Order;
import org.example.common.model.State;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import lombok.RequiredArgsConstructor;

/**
 * Query service using ReadySet for high-performance reads.
 */
@Service
@RequiredArgsConstructor
public class ReadySetOrderQueryService {

    @Qualifier("readySetJdbcTemplate")
    private final JdbcTemplate readySetJdbcTemplate;

    private static final RowMapper<Order> ORDER_ROW_MAPPER = (rs, rowNum) -> Order.builder()
        .id(rs.getLong("id"))
        .orderId(rs.getString("order_id"))
        .clOrdId(rs.getString("cl_ord_id"))
        .symbol(rs.getString("symbol"))
        .state(State.valueOf(rs.getString("state")))
        .orderQty(rs.getBigDecimal("order_qty"))
        .cumQty(rs.getBigDecimal("cum_qty"))
        .leavesQty(rs.getBigDecimal("leaves_qty"))
        .build();

    /**
     * Find orders by state (uses ReadySet cache).
     */
    public List<Order> findOrdersByState(State state) {
        return readySetJdbcTemplate.query(
            "SELECT * FROM orders WHERE state = ?",
            ORDER_ROW_MAPPER,
            state.name()
        );
    }

    /**
     * Find orders by symbol and state (uses ReadySet cache).
     */
    public List<Order> findOrdersBySymbolAndState(String symbol, State state) {
        return readySetJdbcTemplate.query(
            "SELECT * FROM orders WHERE symbol = ? AND state = ?",
            ORDER_ROW_MAPPER,
            symbol,
            state.name()
        );
    }

    /**
     * Get order summary (uses ReadySet cached aggregation).
     */
    public List<OrderSummary> getOrderSummaryByAccount() {
        return readySetJdbcTemplate.query(
            "SELECT account, state, COUNT(*) as order_count, " +
            "       SUM(order_qty) as total_qty, SUM(cum_qty) as total_filled " +
            "FROM orders " +
            "WHERE creation_date >= CURRENT_DATE " +
            "GROUP BY account, state",
            (rs, rowNum) -> OrderSummary.builder()
                .account(rs.getString("account"))
                .state(State.valueOf(rs.getString("state")))
                .orderCount(rs.getLong("order_count"))
                .totalQty(rs.getBigDecimal("total_qty"))
                .totalFilled(rs.getBigDecimal("total_filled"))
                .build()
        );
    }
}
```

---

#### ReadySet Monitoring

```java
package org.example.oms.monitoring;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Monitors ReadySet cache performance and hit rates.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ReadySetMonitor {

    @Qualifier("readySetJdbcTemplate")
    private final JdbcTemplate readySetJdbcTemplate;

    private final MeterRegistry meterRegistry;

    @Scheduled(fixedRate = 60000) // Every minute
    public void monitorCachePerformance() {
        try {
            List<Map<String, Object>> cacheStats = readySetJdbcTemplate.queryForList(
                "SHOW READYSET STATUS"
            );

            for (Map<String, Object> stat : cacheStats) {
                String cacheName = (String) stat.get("name");
                Long hits = ((Number) stat.get("cache_hits")).longValue();
                Long misses = ((Number) stat.get("cache_misses")).longValue();

                // Record cache hit rate
                double hitRate = misses > 0
                    ? (double) hits / (hits + misses)
                    : 1.0;

                meterRegistry.gauge(
                    "readyset.cache.hit_rate",
                    Tags.of("cache", cacheName),
                    hitRate
                );

                if (hitRate < 0.8) {
                    log.warn("Low cache hit rate for {}: {}", cacheName, hitRate);
                }
            }
        } catch (Exception e) {
            log.error("Failed to monitor ReadySet performance", e);
        }
    }
}
```

---

### 5.3 Event Sourcing CQRS Implementation

#### Event Projector Service

```java
package org.example.oms.projection;

import java.math.BigDecimal;
import org.example.oms.model.OrderEvent;
import org.example.oms.model.Event;
import org.example.oms.querydb.OrderReadModel;
import org.example.oms.querydb.OrderReadModelRepository;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Projects events from write store to read-optimized query store.
 * Consumes events from Kafka and updates denormalized read models.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class OrderEventProjector {

    private final OrderReadModelRepository readModelRepository;

    /**
     * Consumes order events and projects into read model.
     */
    @KafkaListener(topics = "order-events", groupId = "order-projector")
    @Transactional
    public void projectOrderEvent(OrderEvent event) {
        log.info("Projecting event: {} for order: {}", event.getEvent(), event.getOrderId());

        try {
            switch (event.getEvent()) {
                case NEW_ORDER:
                    projectNewOrder(event);
                    break;

                case ORDER_ACCEPTED:
                    projectOrderAccepted(event);
                    break;

                case ORDER_FILLED:
                    projectOrderFilled(event);
                    break;

                case ORDER_CANCELLED:
                    projectOrderCancelled(event);
                    break;

                default:
                    log.warn("Unknown event type: {}", event.getEvent());
            }
        } catch (Exception e) {
            log.error("Failed to project event: {}", event, e);
            throw e; // Trigger retry
        }
    }

    private void projectNewOrder(OrderEvent event) {
        OrderReadModel readModel = OrderReadModel.builder()
            .orderId(event.getOrderId())
            .state("NEW")
            .createdAt(event.getTimeStamp())
            // Extract fields from event.getTransaction()
            .build();

        readModelRepository.save(readModel);
    }

    private void projectOrderAccepted(OrderEvent event) {
        OrderReadModel readModel = readModelRepository.findByOrderId(event.getOrderId())
            .orElseThrow();

        readModel.setState("LIVE");
        readModel.setUpdatedAt(event.getTimeStamp());

        readModelRepository.save(readModel);
    }

    private void projectOrderFilled(OrderEvent event) {
        OrderReadModel readModel = readModelRepository.findByOrderId(event.getOrderId())
            .orElseThrow();

        readModel.setState("FILLED");
        readModel.setUpdatedAt(event.getTimeStamp());
        // Update cumQty, avgPx from event

        readModelRepository.save(readModel);
    }

    private void projectOrderCancelled(OrderEvent event) {
        OrderReadModel readModel = readModelRepository.findByOrderId(event.getOrderId())
            .orElseThrow();

        readModel.setState("CANCELLED");
        readModel.setUpdatedAt(event.getTimeStamp());

        readModelRepository.save(readModel);
    }
}
```

---

#### Denormalized Read Model

```java
package org.example.oms.querydb;

import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

/**
 * Denormalized read model optimized for query performance.
 * Contains flattened data from multiple write-side entities.
 */
@Entity
@Table(name = "order_read_model",
    indexes = {
        @Index(name = "idx_read_symbol_state", columnList = "symbol, state"),
        @Index(name = "idx_read_account", columnList = "account"),
        @Index(name = "idx_read_created_at", columnList = "created_at")
    }
)
@SuperBuilder
@NoArgsConstructor
@Getter
@Setter
public class OrderReadModel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", unique = true, nullable = false)
    private String orderId;

    // Denormalized fields for fast queries
    private String symbol;
    private String account;
    private String state;
    private BigDecimal orderQty;
    private BigDecimal cumQty;
    private BigDecimal avgPx;

    // Pre-calculated fields for UI
    @Column(name = "fill_percentage")
    private Double fillPercentage; // cumQty / orderQty * 100

    @Column(name = "notional_value")
    private BigDecimal notionalValue; // orderQty * avgPx

    // Timestamps
    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;
}
```

---

### 5.4 Query Performance Comparison

#### Benchmark Results

| Approach | Query Latency (p95) | Throughput (QPS) | Replication Lag | Complexity |
|----------|---------------------|------------------|-----------------|------------|
| **Logical Replication** | 15ms | 5,000 | ~100ms | Low |
| **Hyperscale (Citus)** | 10ms | 20,000 | ~100ms | Medium |
| **Event Sourcing CQRS** | 8ms | 25,000 | ~500ms | High |
| **ReadySet** | 2ms | 50,000 | ~50ms | Medium |

**Notes:**
- ReadySet provides the lowest latency due to in-memory caching
- Event Sourcing CQRS has higher lag but better scalability
- Logical Replication offers the best balance of simplicity and performance

---

## Related Documents

- [OMS State Store](oms-state-store.md) — Write-optimized event store that feeds the query store via CQRS pattern
- [Domain Model](domain-model_spec.md) — Domain entities denormalized into read-optimized query models
- [Streaming Architecture](../oms-concepts/streaming-architecture.md) — Kafka events trigger query store updates for eventual consistency
- [OMS Admin UI](../ui/oms-admin-ui_spec.md) — Frontend consumes query API for order, execution, and quote retrieval
