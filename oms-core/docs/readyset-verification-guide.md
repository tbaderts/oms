# ReadySet Caching Verification Guide

This guide explains how to verify that ReadySet caching is working correctly in the OMS application.

## Architecture Overview

OMS uses a CQRS pattern with separate datasources:
- **Write operations** → Direct to PostgreSQL (port 5432)
- **Read operations** → Through ReadySet cache proxy (port 5433)

```mermaid
flowchart LR
    subgraph Application
        App[OMS Application]
    end
    subgraph "Data Layer"
        ReadySet(ReadySet Cache :5433)
        PostgresDB(PostgreSQL :5432)
    end
    App -->|Writes @Transactional| PostgresDB
    App -->|Reads @UseReadReplica| ReadySet
    PostgresDB -->|Logical Replication Stream| ReadySet
    ReadySet -->|Cache Misses| PostgresDB
```

## Configuration

### docker-compose.yml
```yaml
readyset:
  image: readysettech/readyset:latest
  container_name: readyset
  environment:
    UPSTREAM_DB_URL: postgres://postgres:changeme@postgres:5432/postgres
    LISTEN_ADDRESS: 0.0.0.0:5433
    # Query caching modes: explicit (default), async, inrequestpath
    QUERY_CACHING: async
  ports:
    - "5433:5433"     # SQL proxy port
    - "6034:6034"     # Prometheus metrics endpoint
```

### Query Caching Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `explicit` | Manual `CREATE CACHE` required | Full control over what gets cached |
| `async` | Auto-caches supported queries in background | **Recommended** - transparent caching |
| `inrequestpath` | Auto-caches on first query execution | Immediate caching, slight first-query latency |

### application.yml
```yaml
spring:
  datasource:
    write:
      url: ${DB_URL}           # jdbc:postgresql://localhost:5432/postgres
      username: ${DB_USER}
      password: ${DB_PASSWORD}
    read:
      url: ${READYSET_URL}     # jdbc:postgresql://localhost:5433/postgres
      username: ${DB_USER}
      password: ${DB_PASSWORD}
```

### Routing Annotation
Use `@UseReadReplica` on methods/classes to route reads through ReadySet:

```java
@UseReadReplica
@Transactional(readOnly = true)
public List<Order> findOrdersBySymbol(String symbol) {
    return orderRepository.findBySymbol(symbol);
}
```

## Verification Commands

Connect to ReadySet (port 5433) and run these diagnostic commands:

### 1. Check Overall Status
```sql
SHOW READYSET STATUS;
```

Expected output:
| name | value |
|------|-------|
| Database Connection | Connected |
| Status | Online |
| Last completed snapshot | (recent timestamp) |

### 2. View Replicated Tables
```sql
SHOW READYSET TABLES;
```

Expected output:
| table | status |
|-------|--------|
| "public"."orders" | Online |
| "public"."executions" | Online |
| "public"."order_events" | Online |
| "public"."order_messages" | Online |
| "public"."quotes" | Online |

### 3. View Active Caches
```sql
SHOW CACHES;
```

Shows all queries that have been cached for fast retrieval.

### 4. View Cacheable Queries
```sql
SHOW PROXIED SUPPORTED QUERIES;
```

Shows queries that ReadySet can cache but haven't been cached yet.

### 5. View All Proxied Queries
```sql
SHOW PROXIED QUERIES;
```

Shows all queries passing through ReadySet with their cache support status.

### 6. Test Query Cacheability
```sql
EXPLAIN CREATE CACHE FROM SELECT * FROM orders WHERE symbol = 'INTC';
```

Returns `yes` in `readyset supported` column if the query can be cached.

### 7. Verify Query Source
After running a query:
```sql
EXPLAIN LAST STATEMENT;
```

Shows whether the query was served from cache or proxied to PostgreSQL.

| Query_destination | Meaning |
|-------------------|---------|
| `readyset(q_xxx)` | ✅ Served from ReadySet cache |
| `upstream` | Proxied to PostgreSQL |
| `unknown` | Query type not tracked or different connection |

**Important:** `EXPLAIN LAST STATEMENT` only works within the **same database connection/session**. If you run queries from separate connections (e.g., different terminal commands), it will show `unknown`.

## SQL Notebook for Verification

Save these queries in a SQL notebook connected to ReadySet (port 5433):

```sql
-- Cell 1: ReadySet Status & Configuration
SHOW READYSET STATUS

-- Cell 2: Replicated tables
SHOW READYSET TABLES

-- Cell 3: Active caches (count shows cache hits)
SHOW CACHES

-- Cell 4: Test query (run this, then run EXPLAIN LAST STATEMENT in next cell)
SELECT order_id, symbol, side, state FROM orders WHERE symbol = 'INTC' LIMIT 5

-- Cell 5: Check where the PREVIOUS query was served from
-- NOTE: Only works if run immediately after the test query in the SAME connection
-- Query_destination = "readyset(q_xxx)" means cache hit!
-- Query_destination = "upstream" means proxied to PostgreSQL
EXPLAIN LAST STATEMENT

-- Cell 6: Queries that CAN be cached but haven't been yet
SHOW PROXIED SUPPORTED QUERIES

-- Cell 7: Test if a specific query can be cached
EXPLAIN CREATE CACHE FROM SELECT * FROM orders WHERE symbol = 'INTC'
```

## Creating Caches

### Automatic Caching (Recommended)
With `QUERY_CACHING=async` enabled in docker-compose.yml, ReadySet automatically caches supported queries in the background. No manual intervention required.

### Manual Cache Creation
If using `QUERY_CACHING=explicit`, create caches manually:

```sql
-- Cache orders by symbol
CREATE CACHE FROM SELECT order_id, symbol, side, state 
FROM orders WHERE symbol = 'INTC';

-- Cache orders by state
CREATE CACHE FROM SELECT * FROM orders WHERE state = 1;

-- Cache with named identifier
CREATE CACHE orders_by_symbol FROM 
SELECT * FROM orders WHERE symbol = $1;
```

### Drop Caches
```sql
-- Drop specific cache
DROP CACHE q_d6d5f224d114b288;

-- Drop all caches
DROP ALL CACHES;
```

## Cache Statistics & Monitoring

### ReadySet SQL Commands

#### View Cache Hit Counts
```sql
SHOW CACHES;
```
The `count` column shows how many times each cache has been used.

#### Check Query Destination
After running a query:
```sql
EXPLAIN LAST STATEMENT;
```

| Query_destination | Meaning |
|-------------------|---------|
| `readyset` | Served from cache ✅ |
| `upstream` | Proxied to PostgreSQL |
| `unknown` | Query type not tracked |

### Prometheus Metrics

ReadySet exposes metrics on port 6034. Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'readyset'
    static_configs:
      - targets: ['readyset:6034']
```

#### Key Metrics for Caching Effectiveness

Focus on these metrics to understand caching performance:

| Metric | Type | What It Tells You |
|--------|------|-------------------|
| **`readyset_query_log_execution_time_us`** | Summary | Query latency by destination (cache vs upstream). Compare `database_type="readyset"` vs `database_type="upstream"` |
| **`readyset_query_log_execution_time_us_count`** | Counter | Number of queries executed. Split by `database_type` shows cache hit vs miss ratio |
| **`readyset_query_status_cache_persistent_cache_statuses_size`** | Gauge | Number of active caches |
| **`readyset_server_view_query_upquery_duration_us`** | Summary | Time to serve queries from cache (lower = better) |
| **`readyset_replicator_snapshot_duration_us`** | Summary | Time for initial data snapshot |
| **`readyset_client_upstream_connections`** | Gauge | Active connections to PostgreSQL |
| **`readyset_noria_client_connected_clients`** | Gauge | Clients connected to ReadySet |
| **`readyset_allocator_resident_bytes`** | Gauge | Memory used by ReadySet |

#### Calculating Cache Hit Rate

The most important metric is **cache hit rate**. Calculate it from:

```
readyset_query_log_execution_time_us_count{database_type="readyset"} 
  / 
(readyset_query_log_execution_time_us_count{database_type="readyset"} + readyset_query_log_execution_time_us_count{database_type="upstream"})
```

#### Example: Query Latency Comparison

```
# Upstream (PostgreSQL) latency - p50
readyset_query_log_execution_time_us{database_type="upstream",quantile="0.5"} = 45821 μs (45ms)

# ReadySet cache latency - p50 (when available)
readyset_query_log_execution_time_us{database_type="readyset",quantile="0.5"} = ~500 μs (0.5ms)
```

**Target: Cache latency should be 10-100x lower than upstream**

#### View Metrics Directly
```powershell
# Get all ReadySet metrics
Invoke-WebRequest -Uri "http://localhost:6034/metrics" -UseBasicParsing | 
  Select-Object -ExpandProperty Content

# Filter query execution metrics (most important for caching)
Invoke-WebRequest -Uri "http://localhost:6034/metrics" -UseBasicParsing | 
  Select-Object -ExpandProperty Content | 
  Select-String -Pattern "query_log_execution"

# Filter cache-related metrics
Invoke-WebRequest -Uri "http://localhost:6034/metrics" -UseBasicParsing | 
  Select-Object -ExpandProperty Content | 
  Select-String -Pattern "cache|query"
```

### Grafana Dashboard

Import ReadySet metrics into Grafana for visualization:

1. Add Prometheus as data source pointing to `http://prometheus:9090`
2. Create dashboard with these panels:
   - **Cache Hit Rate**: `rate(readyset_cache_hit_count[5m]) / rate(readyset_query_count_total[5m])`
   - **Query Latency**: `histogram_quantile(0.95, rate(readyset_query_latency_seconds_bucket[5m]))`
   - **Replication Lag**: `readyset_replication_lag_seconds`

## Performance Comparison: ReadySet vs Direct PostgreSQL

### Method 1: Using pg_stat_statements

Enable the extension on PostgreSQL:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Compare query performance:
```sql
-- Find slowest queries on PostgreSQL
SELECT query, calls, mean_exec_time, total_exec_time 
FROM pg_stat_statements 
WHERE query ILIKE '%SELECT%' 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Find most frequent queries (best candidates for caching)
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
WHERE query ILIKE '%SELECT%' 
ORDER BY calls DESC 
LIMIT 10;
```

### Method 2: Benchmark Script

Create a simple benchmark to compare latencies:

```powershell
# Benchmark: Direct PostgreSQL vs ReadySet
$query = "SELECT * FROM orders WHERE symbol = 'INTC' LIMIT 100"

# Direct PostgreSQL (port 5432)
$directTime = Measure-Command {
    1..100 | ForEach-Object {
        docker exec -e PGPASSWORD=changeme postgres psql -h localhost -p 5432 -U postgres -c $query | Out-Null
    }
}

# Through ReadySet (port 5433)
$readysetTime = Measure-Command {
    1..100 | ForEach-Object {
        docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres -c $query | Out-Null
    }
}

Write-Host "Direct PostgreSQL: $($directTime.TotalMilliseconds / 100) ms avg"
Write-Host "ReadySet Cache:    $($readysetTime.TotalMilliseconds / 100) ms avg"
Write-Host "Speedup:           $([math]::Round($directTime.TotalMilliseconds / $readysetTime.TotalMilliseconds, 2))x"
```

### Method 3: Application-Level Metrics

Add timing to your Spring Boot application:

```java
@Aspect
@Component
public class QueryTimingAspect {
    
    private static final Logger log = LoggerFactory.getLogger(QueryTimingAspect.class);
    
    @Around("@annotation(UseReadReplica)")
    public Object timeReadReplicaQueries(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.nanoTime();
        try {
            return pjp.proceed();
        } finally {
            long elapsed = System.nanoTime() - start;
            log.info("ReadySet query {} took {} ms", 
                pjp.getSignature().getName(), 
                elapsed / 1_000_000.0);
        }
    }
}
```

### Expected Performance Improvements

| Scenario | Expected Improvement |
|----------|---------------------|
| Simple key lookup | 2-5x faster |
| Aggregation queries | 10-100x faster |
| Complex joins | 5-20x faster |
| High concurrency | Significant DB offload |

### Evaluating Effectiveness

**Good indicators that ReadySet is helping:**
- Cache hit rate > 80%
- Reduced CPU usage on PostgreSQL
- Lower p95/p99 query latencies
- Higher throughput under load

**Signs you may need tuning:**
- Many unsupported queries in `SHOW PROXIED QUERIES`
- Low cache hit counts
- Replication lag increasing

## Known Limitations

### Hibernate/JPA Query Support
Complex Hibernate-generated queries may not be cacheable due to:
- System catalog queries (`pg_type`, `pg_database`)
- Complex joins with `LATERAL UNNEST`
- Non-deterministic functions

### Workarounds
1. **Use native queries** with `@Query` annotation for read-heavy operations
2. **Create manual caches** for known query patterns
3. **Simplify queries** to match ReadySet's supported SQL subset

## Monitoring

### Docker Commands
```powershell
# Check ReadySet container status
docker ps --filter "name=readyset"

# View ReadySet logs
docker logs readyset -f

# Connect to ReadySet via psql
docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres
```

### Health Indicators
- `Database Connection: Connected` - ReadySet connected to upstream PostgreSQL
- `Status: Online` - ReadySet is serving queries
- `Replication Offset` advancing - Changes are being replicated
- Cache `count` increasing - Queries hitting the cache

## Query Caching Limitations

**IMPORTANT:** Not all queries can be cached by ReadySet. Understanding these limitations is critical for achieving good cache hit rates.

### Supported Query Patterns (Cacheable ✓)

ReadySet can cache queries that use **equality filters**:

| Query Pattern | Example | Cacheable |
|---------------|---------|-----------|
| Single equality | `WHERE symbol = 'INTC'` | ✓ Yes |
| Multiple equality | `WHERE symbol = 'INTC' AND side = 'BUY'` | ✓ Yes |
| IN clause | `WHERE state IN ('NEW', 'LIVE')` | ✓ Yes |
| Equality with pagination | `WHERE symbol = $1 ORDER BY id LIMIT 50` | ✓ Yes |

### Unsupported Query Patterns (NOT Cacheable ✗)

ReadySet **cannot cache** queries with these patterns:

| Query Pattern | Example | Reason |
|---------------|---------|--------|
| **BETWEEN clause** | `WHERE price BETWEEN $1 AND $2` | Placeholders in unsupported positions |
| **Range comparisons** | `WHERE price > $1 AND price < $2` | Post-lookup operations not supported |
| **LIKE with wildcards** | `WHERE symbol LIKE '%INT%'` | Pattern matching not cacheable |
| **Complex expressions** | `WHERE (qty * price) > 10000` | Computed expressions not supported |
| **Aggregate functions** | `SELECT SUM(qty) FROM orders` | Aggregations require full scans |
| **JOINs (some)** | Complex multi-table joins | Limited JOIN support |
| **ORDER BY with expressions** | `ORDER BY RANDOM()` | Dynamic ordering not cacheable |

### Identifying Non-Cacheable Queries

Check the ReadySet logs or `SHOW PROXIED QUERIES` for error messages:

```sql
-- Connect to ReadySet (port 5433)
SHOW PROXIED QUERIES;
```

Common error messages indicating non-cacheable queries:

| Error Message | Meaning |
|---------------|---------|
| `Query contains placeholders in unsupported positions` | BETWEEN or range with parameters |
| `Queries which perform operations post-lookup are not supported` | Complex filtering after data retrieval |
| `Table 'xxx' is not being replicated` | Table not configured for replication |
| `non-builtin function (UDF)` | User-defined functions not supported |

### Checking Query Cacheability

Before running queries in production, test if they can be cached:

```sql
-- Test if a specific query can be cached
EXPLAIN CREATE CACHE FROM 
  SELECT * FROM orders WHERE symbol = 'INTC' AND side = 'BUY';
-- Result: "yes" = cacheable, error message = not cacheable

-- View all queries that CAN be cached but aren't yet
SHOW PROXIED SUPPORTED QUERIES;

-- View all queries and their cache status
SHOW PROXIED QUERIES;
```

### JPA/Hibernate Considerations

When using Spring Data JPA with dynamic specifications (`Specification<Order>`), the generated SQL may not be cacheable:

```java
// ❌ This may generate non-cacheable queries with BETWEEN
public Page<Order> search(Map<String, String> params) {
    Specification<Order> spec = OrderSpecifications.dynamic(params);
    return repository.findAll(spec, pageable);
}

// Example filter that generates BETWEEN (NOT cacheable):
// params: { "price__between": "100,200" }
// Generated SQL: WHERE price BETWEEN $1 AND $2

// ✓ Use equality filters instead for better cache hit rates:
// params: { "symbol": "INTC", "side": "BUY" }
// Generated SQL: WHERE symbol = $1 AND side = $2
```

### Optimizing for Cache Hit Rate

1. **Favor equality filters** (`=`) over range filters (`BETWEEN`, `>`, `<`)
2. **Use fixed pagination sizes** to maximize cache reuse
3. **Warm up the cache** with common query patterns on startup
4. **Monitor `SHOW PROXIED QUERIES`** to identify non-cacheable queries
5. **Check logs** for `Query contains placeholders in unsupported positions` errors

### Query Load Generator Recommendations

The `query-load-generator.ipynb` notebook includes both cacheable and non-cacheable query tests:

| Function | Cacheable | Description |
|----------|-----------|-------------|
| `query_by_symbol()` | ✓ Yes | Single equality filter |
| `query_by_side()` | ✓ Yes | Single equality filter |
| `query_by_symbol_and_side()` | ✓ Yes | Combined equality filters |
| `query_by_state()` | ✓ Yes | Single equality filter |
| `query_combined_cacheable()` | ✓ Yes | Random cacheable combinations |
| `query_by_price_range()` | ✗ No | Uses BETWEEN |
| `query_combined()` | ✗ Maybe | May include BETWEEN |

Run the cache-friendly tests to see improved cache hit rates:

```python
# Use cacheable query patterns
results = run_query_batch(query_combined_cacheable, count=200)

# Compare with non-cacheable (for benchmarking)
results = run_query_batch(query_by_price_range, count=100)  # Will show 0% cache hits
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| ReadySet not starting | Check PostgreSQL `wal_level=logical` is set |
| Tables not replicating | Verify tables exist and have primary keys |
| Queries not cached | Use `EXPLAIN CREATE CACHE` to check support |
| Stale data | Check replication offset is advancing |
| Connection refused | Ensure ReadySet container is running on port 5433 |
| Low cache hit rate | Check for BETWEEN/range queries (see "Query Caching Limitations" section) |
| Metrics unavailable | Expose port 6034 in docker-compose.yml |
| `Query contains placeholders in unsupported positions` | Query uses BETWEEN or range with parameters - not cacheable |
| `Queries which perform operations post-lookup` | Complex filtering not supported - simplify query |

## Metrics Dashboard Script

A comprehensive PowerShell script is available to display ReadySet cache metrics without requiring a full Prometheus/Grafana setup.

### Location
```
oms-core/scripts/readyset-metrics.ps1
```

### Usage
```powershell
# From oms-core directory
.\scripts\readyset-metrics.ps1

# With custom parameters
.\scripts\readyset-metrics.ps1 -ReadySetHost "localhost" -MetricsPort 6034
```

### What It Shows

The script provides a real-time dashboard with:

| Section | Description |
|---------|-------------|
| **ReadySet Status** | Connection state, online status, replication offsets, last snapshot time |
| **Active Caches** | Number of cached queries and total cache hits |
| **Query Latency Metrics** | P50/P99 latencies for both upstream (PostgreSQL) and ReadySet cache queries |
| **Cache Hit Rate** | Visual progress bar showing percentage of queries served from cache |
| **Resource Usage** | Memory consumption, client connections, upstream connections |
| **Replicated Tables** | Status of all tables being replicated (Online/Pending) |

### Sample Output
```
==================================================================
          ReadySet Cache Metrics Dashboard
==================================================================

------------------------------------------------------------------
 1. READYSET STATUS
------------------------------------------------------------------
   Database Connection: Connected
   Status: Online
   Last completed snapshot: 2025-11-30 09:08:22 UTC

------------------------------------------------------------------
 2. ACTIVE CACHES
------------------------------------------------------------------
   Active Caches: 2
   Total Cache Hits: 150

------------------------------------------------------------------
 4. CACHE HIT RATE
------------------------------------------------------------------

   Cache Hit Rate: 85%
   [*****************---]

   Total Queries: 200
   Cache Hits:    170
   Cache Misses:  30

   Cache Speedup: 45x faster
```

### Prerequisites
- Port 6034 must be exposed in `docker-compose.yml` for Prometheus metrics
- ReadySet container must be running

## Time-Series Metrics & Visualization (Python)

For collecting time-series data and generating charts without Grafana, use the Python-based metrics collector.

### Python Environment Setup with Conda (One-Time)

If you have Miniconda/Anaconda installed but it's not in your PATH:

```powershell
# 1. Initialize conda for PowerShell (one-time, requires terminal restart)
C:\Users\<username>\miniconda3\Scripts\conda.exe init powershell

# 2. Close and reopen your terminal, or manually activate in current session:
& C:\Users\<username>\miniconda3\shell\condabin\conda-hook.ps1

# 3. Accept Terms of Service if prompted (one-time)
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r
conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/msys2

# 4. Create the oms-metrics environment
conda create -n oms-metrics python=3.11 -y

# 5. Activate and install packages
conda activate oms-metrics
pip install requests matplotlib faker
```

After setup, you only need to activate before use:
```powershell
conda activate oms-metrics
```

### VS Code Jupyter Kernel Setup

To use the conda environment in VS Code notebooks:

1. Open a notebook (`.ipynb` file)
2. Click on the kernel selector (top-right, shows "Select Kernel")
3. Choose "Python Environments" → "oms-metrics"
4. If not visible, click "Select Another Kernel" → "Python Environments" → Refresh

### Location
```
oms-core/scripts/readyset-timeseries.py
```

### Usage

```powershell
# Activate environment first
conda activate oms-metrics

# Navigate to scripts directory
cd oms-core/scripts

# Collect metrics until Ctrl+C, then show charts
python readyset-timeseries.py

# Collect for a specific duration (60 seconds)
python readyset-timeseries.py --duration 60

# Collect with custom interval (every 5 seconds)
python readyset-timeseries.py --interval 5

# Save data for later analysis
python readyset-timeseries.py --duration 120 --save metrics-data.json

# Load and visualize previously saved data
python readyset-timeseries.py --load metrics-data.json
```

### What It Collects

| Metric | Description |
|--------|-------------|
| **Query Counts** | Cumulative cache hits vs upstream queries over time |
| **Cache Hit Rate** | Percentage of queries served from cache |
| **P50/P99 Latency** | Query latency percentiles for both cache and upstream |
| **Memory Usage** | ReadySet memory consumption |
| **Connections** | Client and upstream connection counts |

### Generated Charts

The script generates a 4-panel dashboard saved as `readyset-metrics-chart.png`:

1. **Query Distribution** - Cache hits vs upstream queries over time (area chart)
2. **Cache Hit Rate** - Hit rate percentage with target thresholds (80% good, 50% fair)
3. **Latency Comparison** - P50 latency for cache vs upstream (line chart)
4. **Resource Usage** - Memory and connection counts (dual-axis chart)

### Sample Output

```
📊 ReadySet Metrics Collector
   Endpoint: http://localhost:6034/metrics
   Interval: 2s
   Duration: 60s

   Press Ctrl+C to stop and show charts...

[   2.0s] Queries:   45 cache /   12 upstream | Hit Rate:  78.9% | Memory: 156.2 MB
[   4.0s] Queries:   67 cache /   15 upstream | Hit Rate:  81.7% | Memory: 158.1 MB
[   6.0s] Queries:   89 cache /   18 upstream | Hit Rate:  83.2% | Memory: 159.4 MB
...

============================================================
 📊 METRICS SUMMARY
============================================================

 Queries during collection:
   Total:          892
   Cache Hits:     756
   Upstream:       136
   Hit Rate:       84.8%

 Average Latency (P50):
   Upstream:       12.45 ms
   ReadySet:       0.28 ms
   Speedup:        44.5x

 Memory Usage:
   Average:        162.3 MB
   Peak:           178.5 MB

============================================================

📈 Chart saved to: c:\data\workspace\oms\oms-core\scripts\readyset-metrics-chart.png
```

### Generating Load for Testing

While the collector is running, generate queries in another terminal:

```powershell
# Generate 100 queries through ReadySet
1..100 | ForEach-Object {
    docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres `
        -c "SELECT * FROM orders WHERE symbol = 'INTC' LIMIT 10" | Out-Null
    Start-Sleep -Milliseconds 100
}
```

### Command Reference

| Option | Default | Description |
|--------|---------|-------------|
| `--url` | `http://localhost:6034/metrics` | ReadySet metrics endpoint |
| `--duration` | Until Ctrl+C | Collection duration in seconds |
| `--interval` | 2 | Sampling interval in seconds |
| `--save` | None | Save collected data to JSON file |
| `--load` | None | Load and visualize saved data |
| `--no-chart` | False | Skip chart generation |

## Quick Health Check Script

```powershell
# readyset-health-check.ps1
Write-Host "=== ReadySet Health Check ===" -ForegroundColor Cyan

# 1. Container status
Write-Host "`n1. Container Status:" -ForegroundColor Yellow
docker ps --filter "name=readyset" --format "table {{.Names}}\t{{.Status}}"

# 2. ReadySet status
Write-Host "`n2. ReadySet Status:" -ForegroundColor Yellow
docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres -c "SHOW READYSET STATUS;"

# 3. Replicated tables
Write-Host "`n3. Replicated Tables:" -ForegroundColor Yellow
docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres -c "SHOW READYSET TABLES;"

# 4. Active caches
Write-Host "`n4. Active Caches:" -ForegroundColor Yellow
docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres -c "SHOW CACHES;"

# 5. Supported queries awaiting caching
Write-Host "`n5. Supported Queries (not yet cached):" -ForegroundColor Yellow
docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres -c "SHOW PROXIED SUPPORTED QUERIES;"

Write-Host "`n=== Health Check Complete ===" -ForegroundColor Cyan
```

## References

- [ReadySet Documentation](https://readyset.io/docs)
- [ReadySet Command Reference](https://readyset.io/docs/reference/command-reference)
- [Supported Queries](https://readyset.io/docs/reference/queries)
- [Profiling Queries](https://readyset.io/docs/reference/profiling-queries)
- [OMS State-Query Store Spec](../oms-knowledge-base/oms-framework/state-query-store_spec.md)

## Load Testing with Jupyter Notebooks

Two Jupyter notebooks are provided for generating realistic load to test ReadySet caching.

### Prerequisites

Ensure you have the `oms-metrics` conda environment set up (see [Python Environment Setup with Conda](#python-environment-setup-with-conda-one-time) above).

```powershell
# Activate the environment before running notebooks
conda activate oms-metrics

# Verify packages are installed
pip list | Select-String "requests|matplotlib|faker"
```

### Order Generator Notebook

**Location:** `oms-core/scripts/order-generator.ipynb`

Generates realistic orders with NASDAQ and NYSE stocks.

**Features:**
- 15 NASDAQ stocks (AAPL, MSFT, GOOGL, NVDA, INTC, etc.)
- 15 NYSE stocks (JPM, V, JNJ, WMT, BAC, etc.)
- Realistic price ranges per stock
- Random order types (LIMIT, MARKET, STOP, STOP_LIMIT)
- Configurable batch sizes and delays
- Filter by stock or side

**Usage:**
```python
# Generate 10 random orders
results = generate_orders_batch(count=10, delay_ms=50)

# Generate 50 orders for a specific stock
results = generate_orders_batch(count=50, stock_filter="INTC")

# Generate 100 BUY orders
results = generate_orders_batch(count=100, side_filter="BUY")

# Heavy load: 500 orders
results = generate_orders_batch(count=500, delay_ms=5, verbose=False)
```

### Query Load Generator Notebook

**Location:** `oms-core/scripts/query-load-generator.ipynb`

Tests various query patterns against the OMS Query API.

**Query Patterns Tested:**
| Pattern | Description | Cache Expectation |
|---------|-------------|-------------------|
| Same Symbol | Repeated `symbol=INTC` | Very high hit rate |
| Random Symbol | Random symbols from pool | Medium hit rate |
| Symbol + Side | Combined filters | Medium hit rate |
| Price Range | `price__between=X,Y` | Variable |
| Paginated | With page/size/sort | Variable |
| Mixed Workload | Random combinations | Realistic workload |

**Usage:**
```python
# Run 100 queries with same symbol (high cache hit expected)
results = run_query_batch(same_symbol_query, count=100)

# Random symbol lookups
results = run_query_batch(query_by_symbol, count=200)

# Heavy load test
results = run_query_batch(query_combined, count=500, delay_ms=5)

# Warm up cache before testing
warmup_cache(symbols=["INTC", "AAPL", "MSFT"], iterations=3)
```

**Output Includes:**
- Success/failure counts
- Latency statistics (min, max, mean, median, P95, P99)
- Queries per second throughput
- Latency visualization charts

### Recommended Test Workflow

1. **Start metrics collector** (Terminal 1):
   ```powershell
   conda activate oms-metrics
   cd oms-core/scripts
   python readyset-timeseries.py --duration 300
   ```

2. **Generate orders** (Jupyter - order-generator.ipynb):
   - Run cells to create 200-500 orders across various stocks

3. **Run query load tests** (Jupyter - query-load-generator.ipynb):
   - Run cache warmup
   - Execute different query pattern tests
   - Compare latency results

4. **Analyze results**:
   - Check metrics collector output for cache hit rate
   - Review generated charts
   - Compare latencies across query types
