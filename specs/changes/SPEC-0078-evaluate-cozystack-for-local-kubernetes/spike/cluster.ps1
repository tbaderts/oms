# SPEC-0078 spike: disposable k3d cluster (k3s in Docker Desktop), 1 server + 2 agents.
#   .\cluster.ps1 create | delete | stop | start
# Stop the compose stack first (docker compose stop): both draw on the Docker Desktop allotment.
param([ValidateSet('create', 'delete', 'stop', 'start')][string]$Action = 'create')
$ErrorActionPreference = 'Stop'
$name = 'oms-spike'

switch ($Action) {
  'create' {
    # Traefik is disabled (no ingress needed for the spike). The API server is on host port 6550,
    # which no compose service uses; workloads are reached with `kubectl port-forward`.
    k3d cluster create $name --servers 1 --agents 2 --api-port 6550 `
      --k3s-arg '--disable=traefik@server:0' --wait
    kubectl config use-context "k3d-$name"
    kubectl get nodes
  }
  'delete' { k3d cluster delete $name }
  'stop'   { k3d cluster stop $name }
  'start'  { k3d cluster start $name; kubectl config use-context "k3d-$name" }
}
