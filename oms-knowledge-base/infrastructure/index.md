# Infrastructure

Where the OMS runs: the local Docker stack, the planned Cozystack/Kubernetes platform, and observability (logs, traces, metrics).

Back to the [knowledge base index](../index.md).

## Documents

- [Cozystack Platform (planned)](cozystack.md) — Planned cloud-like platform for the OMS on Cozystack: Kubernetes with operators for PostgreSQL, Kafka, Redis and Qdrant, replacing the local compose stack for shared environments. Nothing is built yet.
- [Local Docker Stack](local-docker-stack.md) — The root docker-compose.yml: every OMS module and the infrastructure it needs (PostgreSQL, Kafka with Schema Registry, the Grafana LGTM stack), with ports, how to start, rebuild and reset it, and its known oddities.
- [Observability](observability.md) — The Grafana LGTM stack of the OMS: services push traces, logs and metrics over OTLP to Grafana Alloy, which feeds Tempo, Loki and Mimir; Grafana shows the provisioned OMS dashboards and links traces to logs and metrics.
