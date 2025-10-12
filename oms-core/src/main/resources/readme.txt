swagger:
http://localhost:8090/swagger-ui/index.html#

pgadmin:
http://localhost:5050

jaeger:
http://localhost:16686

grafana:
http://localhost:3000
admin/secret

prometheus:
http://localhost:9090
http://localhost:8090/actuator/metrics

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
export TRACING_URL=http://jaeger:4317
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
