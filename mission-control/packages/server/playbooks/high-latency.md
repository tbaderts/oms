---
title: High Latency Investigation
triggers: [latency, slow, timeout, response time, p99, p95, delay]
priority: 10
---

## Investigation Steps

1. Check Prometheus for current request latency (p50, p95, p99)
2. Compare current latency to baseline (last 24 hours)
3. Check if any alerts are firing for latency or error rate
4. Look at pod resource utilization -- is CPU or memory saturated?
5. Check container logs for timeout errors or connection pool exhaustion
6. Query database for slow queries or lock contention
7. Check Kafka consumer lag if message processing is involved
8. Look for recent deployments that might have introduced the regression
9. Build timeline: when did latency increase? What correlated?
