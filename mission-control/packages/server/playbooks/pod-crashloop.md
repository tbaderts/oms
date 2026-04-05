---
title: Pod CrashLoopBackOff Investigation
triggers: [crashloop, restart, oomkill, crash, backoff, oom, killed]
priority: 10
---

## Investigation Steps

1. Check pod status and restart count across all namespaces
2. Read pod events for OOMKilled, Error, or CrashLoopBackOff reasons
3. Pull last 200 lines of container logs before the most recent crash
4. Check resource limits vs actual usage (memory and CPU)
5. Look for recent deployments that changed the image, config, or resource limits
6. Query database for application-level errors near the crash time
7. Check Prometheus metrics for memory and CPU spikes leading up to the crash
8. Correlate timeline: when did restarts begin? What changed just before?
