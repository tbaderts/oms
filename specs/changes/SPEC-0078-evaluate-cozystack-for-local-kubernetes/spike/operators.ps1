# SPEC-0078 spike: install the four operators the goal asks for, then (optionally) their minimal instances.
#   .\operators.ps1            # operators only
#   .\operators.ps1 -Instances # operators + instances/*.yaml (namespace `oms`)
param([switch]$Instances)
# Helm prints progress (e.g. 'Pulled: …') on stderr, so check exit codes instead of stderr.
$ErrorActionPreference = 'Continue'
function Assert-Ok($what) { if ($LASTEXITCODE) { throw "$what failed (exit $LASTEXITCODE)" } }
kubectl config use-context k3d-oms-spike | Out-Null

helm repo add cnpg https://cloudnative-pg.github.io/charts --force-update | Out-Null
helm repo add strimzi https://strimzi.io/charts/ --force-update | Out-Null
helm repo add ot-helm https://ot-container-kit.github.io/helm-charts/ --force-update | Out-Null
helm repo update | Out-Null

# PostgreSQL: CloudNativePG (also what Cozystack's managed Postgres uses)
helm upgrade --install cnpg cnpg/cloudnative-pg -n cnpg-system --create-namespace --wait; Assert-Ok helm
# Kafka: Strimzi (also what Cozystack's managed Kafka uses); watch every namespace
helm upgrade --install strimzi strimzi/strimzi-kafka-operator -n strimzi --create-namespace `
  --set watchAnyNamespace=true --wait; Assert-Ok helm
# Redis: OT-Container-Kit redis-operator
helm upgrade --install redis-operator ot-helm/redis-operator -n redis-operator --create-namespace --wait; Assert-Ok helm
# Grafana: grafana-operator (runs Grafana and its datasources/dashboards as CRs)
helm upgrade --install grafana-operator oci://ghcr.io/grafana/helm-charts/grafana-operator `
  -n grafana-operator --create-namespace --wait; Assert-Ok helm

if ($Instances) {
  kubectl create namespace oms --dry-run=client -o yaml | kubectl apply -f -
  # Passwords are generated at run time, never committed (P-16).
  $pw = [guid]::NewGuid().ToString('N')
  kubectl -n oms create secret generic oms-db --type kubernetes.io/basic-auth `
    --from-literal=username=oms --from-literal=password=$pw --dry-run=client -o yaml | kubectl apply -f -
  kubectl apply -n oms -f (Join-Path $PSScriptRoot 'instances')
}
