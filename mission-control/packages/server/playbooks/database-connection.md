---
title: Database Connection Investigation
triggers: [database, connection, refused, pool, exhausted, pg, postgres, sql]
priority: 10
---

## Investigation Steps

1. Check if the database pod/container is running and healthy
2. Read database container logs for connection limit or OOM errors
3. Check application logs for connection refused or pool exhaustion errors
4. Query database for active connections count vs max_connections
5. Look for long-running queries or lock contention
6. Check if any recent deployments changed connection pool settings
7. Verify network connectivity between application pods and database
8. Check Prometheus for database metrics (connections, query duration)
