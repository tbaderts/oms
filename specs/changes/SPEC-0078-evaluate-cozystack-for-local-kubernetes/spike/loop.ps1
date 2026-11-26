# SPEC-0078 spike: the plain-script Kubernetes inner loop for oms-core, timed per step.
#   .\loop.ps1 [-OmsCoreDir <path>] [-Runs 3]
# Steps: gradle bootJar -> docker build -> k3d image import -> kubectl rollout restart -> rollout status
# OmsCoreDir defaults to the repo's oms-core. The spike used a scratch copy so it would not touch a shared working tree.
param([string]$OmsCoreDir = (Join-Path $PSScriptRoot '..\..\..\..\oms-core'), [int]$Runs = 3)
$ErrorActionPreference = 'Continue'
kubectl config use-context k3d-oms-spike | Out-Null
$marker = Join-Path $OmsCoreDir 'src\main\java\org\example\oms\SpikeMarker.java'

function Step([scriptblock]$b) { $sw = [Diagnostics.Stopwatch]::StartNew(); & $b *> $null; if ($LASTEXITCODE) { throw "step failed: $b" }; [math]::Round($sw.Elapsed.TotalSeconds, 1) }

try {
  for ($i = 1; $i -le $Runs; $i++) {
    # A real one-class change, so Gradle and Docker cannot answer from cache.
    # WriteAllText writes UTF-8 without a BOM; PowerShell 5.1's Set-Content adds one, which javac rejects.
    [IO.File]::WriteAllText($marker, "package org.example.oms;`nclass SpikeMarker { static final String RUN = `"$i-$([DateTime]::Now.Ticks)`"; }")
    $gradle  = Step { Push-Location $OmsCoreDir; .\gradlew.bat bootJar -x test -q --console=plain; Pop-Location }
    $image   = Step { docker build -q -t oms-core:latest $OmsCoreDir }
    $import  = Step { k3d image import oms-core:latest -c oms-spike }
    $restart = Step { kubectl -n oms rollout restart deploy/oms-core }
    $ready   = Step { kubectl -n oms rollout status deploy/oms-core --timeout=600s }
    $replicas = kubectl -n oms get deploy oms-core -o jsonpath='{.spec.replicas}'
    "run$i replicas=$replicas gradle=$gradle image=$image import=$import restart=$restart ready=$ready total=$([math]::Round($gradle+$image+$import+$restart+$ready,1))"
  }
} finally { Remove-Item -ErrorAction SilentlyContinue $marker }
