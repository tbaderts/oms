
create docker image:
./gradlew clean build
docker build -t org.oms/transactions:0.0.1-SNAPSHOT .
docker scout quickview
docker run --name=transactions --rm org.oms/transactions:0.0.1-SNAPSHOT

install redis:
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo redis
helm install oms bitnami/redis-cluster
export REDIS_PASSWORD=$(kubectl get secret --namespace "default" oms-redis-cluster -o jsonpath="{.data.redis-password}" | base64 -d)
kubectl run --namespace default oms-redis-cluster-client --rm --tty -i --restart='Never' --env REDIS_PASSWORD=$REDIS_PASSWORD --image docker.io/bitnami/redis-cluster:7.4.0-debian-12-r0 -- bash
redis-cli -c -h oms-redis-cluster -a $REDIS_PASSWORD
pXtI7hG8tR

install app:
https://spring.academy/guides/kubernetes-app-enhancements-spring-k8s
kubectl apply -f .\k8s\transactions-configmap.yml
kubectl apply -f .\k8s\namespace-reader-role.yml
kubectl create serviceaccount api-service-account
kubectl create clusterrolebinding service-pod-reader-transactions --clusterrole=namespace-reader --serviceaccount=default:api-service-account
kubectl apply -f .\k8s\transactions-deployment.yml
kubectl get pods
kubectl --namespace default port-forward transactions-54688c4d9-nxhxd 8888:8888
http://localhost:8888/webjars/swagger-ui/index.html
http://localhost:8888/actuator/prometheus

helm:
mkdir helm
cd helm
helm create transactions
cd transactions
update values.yaml
helm lint .
helm package .
cd ../..
helm install transactions ./helm/transactions
kubectl get all -l app.kubernetes.io/transactions

kubernetes dashboard:
helm repo add kubernetes-dashboard https://kubernetes.github.io/dashboard/
helm upgrade --install kubernetes-dashboard kubernetes-dashboard/kubernetes-dashboard --create-namespace --namespace kubernetes-dashboard
kubectl -n kubernetes-dashboard port-forward svc/kubernetes-dashboard-kong-proxy 8443:443
https://localhost:8443
kubectl apply -f .\k8s\kubernetes-dashboard.yml
kubectl -n kubernetes-dashboard create token admin-user

prometheus:
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install prometheus prometheus-community/prometheus
kubectl patch ds prometheus-prometheus-node-exporter --type "json" -p '[{"op": "remove", "path" : "/spec/template/spec/containers/0/volumeMounts/2/mountPropagation"}]'
kubectl get pods
kubectl --namespace default port-forward prometheus-prometheus-pushgateway-66fc55f8d-zwhfm 9091
kubectl --namespace default port-forward prometheus-server-5b95c444dc-n58z9 9090:9090
http://localhost:9090

redis exporter:
helm install prometheus-redis-exporter prometheus-community/prometheus-redis-exporter
export POD_NAME=$(kubectl get pods --namespace default -l "app=prometheus-redis-exporter,release=prometheus-redis-exporter" -o jsonpath="{.items[0].metadata.name}")
kubectl port-forward $POD_NAME 8080:
http://127.0.0.1:8080

grafana:
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install grafana grafana/grafana
export POD_NAME=$(kubectl get pods --namespace default -l "app.kubernetes.io/name=grafana,app.kubernetes.io/instance=grafana" -o jsonpath="{.items[0].metadata.name}")
kubectl --namespace default port-forward $POD_NAME 3000
kubectl get secret --namespace default grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
http://localhost:3000
kubernetes dashboard: 18283
prometheus data source: http://prometheus-server:80

metrics:
info memory
info stats
https://redis.io/docs/latest/operate/rs/clusters/monitoring/
https://signoz.io/blog/redis-monitoring/
https://signoz.io/blog/redis-opentelemetry/

test order:
{
   "type":"newOrderTx",
   "sessionId":"dev-session",
   "clOrdId":"20240818-test-001",
   "sendingTime":"2024-08-18T08:55:00",
   "account":"test-customer",
   "execInst":"A",
   "handlInst":"2",
   "securityIDSource":"5",
   "orderQty":100,
   "priceType":"2",
   "ordType":"2",
   "price":30,
   "securityId":"INTC.OQ",
   "side":"1",
   "timeInForce":"0",
   "securityExchange":"XNAS"
}