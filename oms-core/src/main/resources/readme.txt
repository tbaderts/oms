swagger:
http://localhost:8090/swagger-ui/index.html#

pgadmin:
http://localhost:5050

grafana:
http://localhost:3000
admin/secret

alloy (telemetry agent; OTLP for host and containers):
http://localhost:12345
OTLP gRPC localhost:4317, OTLP HTTP localhost:4318

mimir (metrics; Prometheus API under /prometheus):
http://localhost:9009
http://localhost:8090/actuator/metrics

loki:
http://localhost:3100

tempo:
http://localhost:3200

one-time migration from the SPEC-0031 stack (removes old jaeger/prometheus/promtail containers):
docker compose up -d --remove-orphans
if tempo 3 cannot read old tempo 2 blocks: docker compose rm -sf tempo && docker compose up -d tempo

local:
export DB_URL=jdbc:postgresql://localhost:5432/postgres?autoReconnect=true
export DB_USER=postgres
export DB_PASSWORD=changeme
export KAFKA_BROKERS=localhost:9092
export ORDER_TOPIC=oms_orders
export CONSUMER_GROUP=oms_consumer_group
export REGISTRY_URL=http://localhost:8081
export TX_ID_PREFIX=tx-
export DEAD_LETTER_TOPIC=oms_dlq
export TRACING_URL=http://localhost:4317
export SERVER_PORT=8090

docker:
export DB_URL=jdbc:postgresql://postgres:5432/oms
export DB_USER=postgres
export DB_PASSWORD=changeme
export KAFKA_BROKERS=broker:29092
export ORDER_TOPIC=oms_orders
export CONSUMER_GROUP=oms_consumer_group
export REGISTRY_URL=http://schema-registry:8081
export TX_ID_PREFIX=tx-
export DEAD_LETTER_TOPIC=oms_dlq
export TRACING_URL=http://alloy:4317
export SERVER_PORT=8090

kubernetes:
helm install postgres-operator oci://registry-1.docker.io/bitnamicharts/postgresql
export DB_PASSWORD=$(kubectl get secret --namespace default postgres-operator-postgresql -o jsonpath="{.data.postgres-password}" | base64 -d)
kubectl port-forward --namespace default svc/postgres-operator-postgresql 5432:5432 & PGPASSWORD="$DB_PASSWORD" psql --host 127.0.0.1 -U postgres -d postgres -p 5432

https://docs.confluent.io/operator/current/co-deploy-cfk.html
helm repo add confluentinc https://packages.confluent.io/helm
helm repo update
helm upgrade --install confluent-operator confluentinc/confluent-for-kubernetes --namespace default

skaffold:
skaffold init --compose-file docker-compose.yml
