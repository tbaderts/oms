# SPEC-0032 LGTM stack smoke test (AC-1..AC-8 of
# specs/changes/SPEC-0032-migrate-lgtm-stack-to-alloy-mimir-tempo).
# Stack: Grafana, Loki, Tempo 3, Mimir and the Alloy telemetry agent.
# Run from anywhere; it locates the repo root itself.
#   powershell -File oms-core/scripts/lgtm-smoke-test.ps1 [-AdminPassword <GF_SECURITY_ADMIN_PASSWORD>]
#
# NB: global ErrorActionPreference stays Continue: with Stop, redirecting a
# native command's stderr (docker compose prints progress to stderr) produces
# a terminating ErrorRecord dead-lock while docker waits on the pipe.
param(
    # Must match the GF_SECURITY_ADMIN_PASSWORD default in docker-compose.yml
    [string]$AdminPassword = 'secret'
)

$ErrorActionPreference = 'Continue'
$RepoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $RepoRoot

$LgtmServices = @('grafana', 'loki', 'tempo', 'mimir', 'alloy')
$ObsoleteServices = @('promtail', 'prometheus', 'jaeger')
$AppServices = @('postgres', 'oms-core')
# Minimum image versions (AC-1)
$MinImages = [ordered]@{
    'alloy'   = @{ Repo = 'grafana/alloy';   Min = '1.21.3' }
    'mimir'   = @{ Repo = 'grafana/mimir';   Min = '3.2.4' }
    'tempo'   = @{ Repo = 'grafana/tempo';   Min = '3.1.1' }
    'loki'    = @{ Repo = 'grafana/loki';    Min = '3.7.9' }
    'grafana' = @{ Repo = 'grafana/grafana'; Min = '13.3.0' }
}

function Get-UnixNanos { [int64][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000 }

# Set by Remove-ObsoleteContainers once promtail is gone; AC-5's marker query starts here
$LogsSinceNs = Get-UnixNanos

function Add-Result {
    param([string]$Ac, [string]$Name, [bool]$Pass, [string]$Detail = '')
    $script:Results.Add([pscustomobject]@{ Ac = $Ac; Name = $Name; Pass = $Pass; Detail = $Detail })
    Write-Host ("    [{0}] {1} {2} {3}" -f $(if ($Pass) { 'PASS' } else { 'FAIL' }), $Ac, $Name, $Detail)
}

# Invoke $Probe repeatedly (5s apart) until it returns a truthy value or the
# timeout expires. Returns the last probe result ($true/$false).
function Wait-Until {
    param([scriptblock]$Probe, [int]$TimeoutSeconds = 60, [string]$Because = '')
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    Write-Host "    waiting (up to ${TimeoutSeconds}s): $Because"
    while ($true) {
        $ok = $false
        try { $ok = & $Probe } catch { $ok = $false }
        if ($ok) { return $true }
        if ((Get-Date) -ge $deadline) { return $false }
        Start-Sleep -Seconds 5
    }
}

function Get-HttpStatus {
    param([string]$Uri)
    try {
        (Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop).StatusCode
    } catch {
        if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    }
}

function Send-OtlpJson {
    param([string]$Signal, [string]$Json)
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:4318/v1/$Signal" -Method Post -ContentType 'application/json' `
            -Body $Json -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $resp.StatusCode
    } catch {
        if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    }
}

function New-HexId { param([int]$Length) ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')).Substring(0, $Length) }

# ---- AC-1: compose services, image pins, obsolete config files, config validity ----
# Dash-leading image flags (-config.file=..., -verify-config) must ride in a
# splatted array: bare, PS 5.1 splits them at the dot before native handoff.
function Check-Config {
    Write-Host '  [AC-1] compose services, image pins and config files'

    $json = (& docker compose config --format json 2> $null) -join "`n"
    $exit = $LASTEXITCODE
    Add-Result 'AC-1' 'docker compose config --format json' ($exit -eq 0) "exit=$exit"
    if ($exit -ne 0) { return }
    $config = $json | ConvertFrom-Json
    $script:ProjectName = $config.name
    $services = @($config.services.PSObject.Properties | ForEach-Object { $_.Name })

    $missing = @($LgtmServices | Where-Object { $services -notcontains $_ })
    Add-Result 'AC-1' 'services include alloy, mimir, tempo, loki, grafana' ($missing.Count -eq 0) $(if ($missing) { "missing: $($missing -join ',')" } else { '' })
    $present = @($ObsoleteServices | Where-Object { $services -contains $_ })
    Add-Result 'AC-1' 'services exclude promtail, prometheus, jaeger' ($present.Count -eq 0) $(if ($present) { "present: $($present -join ',')" } else { '' })

    foreach ($svc in $MinImages.Keys) {
        $want = $MinImages[$svc]
        $image = if ($services -contains $svc) { $config.services.$svc.image } else { '' }
        $ok = $false
        if ($image -match "^$([regex]::Escape($want.Repo)):v?(\d+\.\d+\.\d+)$") {
            $ok = ([version]$Matches[1]) -ge ([version]$want.Min)
        }
        Add-Result 'AC-1' "$svc image pinned >= $($want.Repo):$($want.Min)" $ok "image='$image'"
    }

    foreach ($rel in @('oms-core\promtail-config.yml', 'oms-core\prometheus.yml')) {
        Add-Result 'AC-1' "removed: $rel" (-not (Test-Path (Join-Path $RepoRoot $rel)))
    }

    # Each component checks its own mounted config with its own binary
    $checks = [ordered]@{
        'alloy validate'      = @('compose', 'run', '--rm', '--no-deps', '-T', 'alloy', 'validate', '/etc/alloy/config.alloy')
        'loki -verify-config' = @('compose', 'run', '--rm', '--no-deps', '-T', 'loki',
                                  '-config.file=/etc/loki/loki-config.yaml', '-verify-config')
        'tempo -config.verify' = @('compose', 'run', '--rm', '--no-deps', '-T', 'tempo',
                                   '-config.file=/etc/tempo/tempo-config.yaml', '-config.verify=true')
    }
    foreach ($name in $checks.Keys) {
        $cmdArgs = $checks[$name]
        & docker @cmdArgs *> $null
        Add-Result 'AC-1' $name ($LASTEXITCODE -eq 0) "exit=$LASTEXITCODE"
    }
}

# ---- before AC-2: containers of removed services are compose orphans; a leftover
# jaeger would still hold host 4317 and stop alloy from starting ----
function Remove-ObsoleteContainers {
    $project = if ($script:ProjectName) { $script:ProjectName } else { 'oms' }
    foreach ($svc in $ObsoleteServices) {
        $ids = @(& docker ps -aq --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$svc")
        if ($ids.Count -gt 0) {
            Write-Host "    removing obsolete $svc container(s): $($ids -join ',')"
            & docker rm -f @ids *> $null
        }
    }
    $script:LogsSinceNs = Get-UnixNanos
}

# ---- AC-2: the LGTM services come up, stay up and report ready ----
function Wait-StackHealthy {
    Write-Host '  [AC-2] bringing up grafana loki tempo mimir alloy'

    & docker compose up -d @LgtmServices *> $null
    $upExit = $LASTEXITCODE
    Add-Result 'AC-2' 'docker compose up -d grafana loki tempo mimir alloy' ($upExit -eq 0) "exit=$upExit"

    $readyUrls = @('http://localhost:3100/ready', 'http://localhost:3200/ready',
                   'http://localhost:9009/ready', 'http://localhost:12345/-/ready')

    $healthy = Wait-Until {
        # ps --format json is JSONL: parse line-wise (PS 5.1 ConvertFrom-Json
        # is single-document)
        $ps = @((& docker compose ps --format json) | ForEach-Object { $_ | ConvertFrom-Json })
        $running = @($ps | Where-Object { $_.State -eq 'running' } | ForEach-Object { $_.Service })
        $restarting = @($ps | Where-Object { $_.State -eq 'restarting' } | ForEach-Object { $_.Service })
        $missing = @($LgtmServices | Where-Object { $running -notcontains $_ })
        $notReady = @($readyUrls | Where-Object { (Get-HttpStatus $_) -ne 200 })
        ($missing.Count -eq 0) -and ($restarting.Count -eq 0) -and ($notReady.Count -eq 0)
    } 90 'all five running, none restarting, /ready endpoints 200'

    $ps = @((& docker compose ps --format json) | ForEach-Object { $_ | ConvertFrom-Json })
    $states = (@($ps | Where-Object { $LgtmServices -contains $_.Service }) | ForEach-Object { "$($_.Service)=$($_.State)" }) -join ' '
    Add-Result 'AC-2' 'all LGTM services running, none restarting (90s probed every 5s)' $healthy $states

    # A crash-looping container can be "running" at the moment of a probe; its restart
    # count cannot hide it
    $restarts = @($ps | Where-Object { $LgtmServices -contains $_.Service } | ForEach-Object {
        "$($_.Service)=$((& docker inspect -f '{{.RestartCount}}' $_.Name) -join '')"
    })
    $noRestarts = ($restarts.Count -eq $LgtmServices.Count) -and (@($restarts | Where-Object { $_ -notmatch '=0$' }).Count -eq 0)
    Add-Result 'AC-2' 'RestartCount is 0 for all LGTM containers' $noRestarts ($restarts -join ' ')
    foreach ($url in $readyUrls) {
        $code = Get-HttpStatus $url
        Add-Result 'AC-2' "GET $url" ($code -eq 200) "status=$code"
    }
}

# ---- AC-3: grafana datasources are exactly Mimir, Loki, Tempo and all healthy ----
function Check-GrafanaDatasources {
    Write-Host '  [AC-3] grafana datasources'
    $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:$AdminPassword"))
    $headers = @{ Authorization = "Basic $encoded" }
    $expected = @{
        'Mimir' = @{ Type = 'prometheus'; Url = 'http://mimir:9009/prometheus' }
        'Loki'  = @{ Type = 'loki';       Url = 'http://loki:3100' }
        'Tempo' = @{ Type = 'tempo';      Url = 'http://tempo:3200' }
    }

    # PS 5.1 Invoke-RestMethod emits a JSON array as ONE object: assign first, then
    # @() the variable, or the array ends up nested as a single element
    $setOk = Wait-Until {
        $resp = Invoke-RestMethod -Uri 'http://localhost:3000/api/datasources' -Headers $headers -TimeoutSec 10 -ErrorAction Stop
        $ds = @($resp)
        $names = @($ds | ForEach-Object { $_.name } | Sort-Object)
        $match = ($names -join ',') -eq 'Loki,Mimir,Tempo'
        foreach ($d in $ds) {
            $e = $expected[$d.name]
            if (($null -eq $e) -or ($d.type -ne $e.Type) -or ($d.url -ne $e.Url)) { $match = $false }
        }
        $match
    } 60 'GET :3000/api/datasources is exactly Mimir/Loki/Tempo with in-network URLs'

    $ds = @()
    $detail = ''
    try {
        $resp = Invoke-RestMethod -Uri 'http://localhost:3000/api/datasources' -Headers $headers -TimeoutSec 10
        $ds = @($resp)
        $detail = ($ds | ForEach-Object { "$($_.name)/$($_.type)=$($_.url)" }) -join ' '
    } catch { $detail = $_.Exception.Message }
    Add-Result 'AC-3' 'datasources are exactly Mimir, Loki, Tempo' $setOk $detail

    foreach ($d in $ds) {
        $uid = $d.uid
        $healthOk = Wait-Until {
            $h = Invoke-RestMethod -Uri "http://localhost:3000/api/datasources/uid/$uid/health" -Headers $headers -TimeoutSec 20 -ErrorAction Stop
            $h.status -eq 'OK'
        } 60 "$($d.name) health OK"
        $msg = ''
        try {
            $msg = (Invoke-RestMethod -Uri "http://localhost:3000/api/datasources/uid/$uid/health" -Headers $headers -TimeoutSec 20).message
        } catch { $msg = $_.Exception.Message }
        Add-Result 'AC-3' "$($d.name) ($uid) health OK" $healthOk $msg
    }
}

# ---- AC-4: alloy scrapes oms-core into mimir ----
function Check-MimirScrape {
    Write-Host '  [AC-4] alloy scrape of oms-core lands in mimir'
    & docker compose up -d @AppServices *> $null
    Add-Result 'AC-4' 'docker compose up -d postgres oms-core' ($LASTEXITCODE -eq 0) "exit=$LASTEXITCODE"

    $query = @{ query = 'up{job="oms-core"}' }
    $ok = Wait-Until {
        $r = Invoke-RestMethod -Uri 'http://localhost:9009/prometheus/api/v1/query' -Body $query -TimeoutSec 10 -ErrorAction Stop
        @($r.data.result | Where-Object { $_.value[1] -eq '1' }).Count -gt 0
    } 90 'mimir up{job="oms-core"} == 1'

    $detail = ''
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost:9009/prometheus/api/v1/query' -Body $query -TimeoutSec 10
        $detail = (@($r.data.result) | ForEach-Object { "$($_.metric.instance)=$($_.value[1])" }) -join ', '
    } catch { $detail = $_.Exception.Message }
    Add-Result 'AC-4' 'up{job="oms-core"} has a sample with value 1' $ok $detail
}

# ---- AC-5: alloy ships this compose project's container logs to loki ----
function Check-LokiLabels {
    Write-Host '  [AC-5] alloy -> loki container log flow'
    $uri = 'http://localhost:3100/loki/api/v1/label/compose_service/values'
    $ok = Wait-Until {
        $labels = Invoke-RestMethod -Uri $uri -TimeoutSec 10 -ErrorAction Stop
        @($labels.data) -contains 'oms-core'
    } 90 'label compose_service has value oms-core'

    $detail = ''
    try { $detail = (@((Invoke-RestMethod -Uri $uri -TimeoutSec 10).data)) -join ', ' } catch { $detail = $_.Exception.Message }
    Add-Result 'AC-5' 'compose_service=oms-core in loki' $ok $detail

    # Label values ignore start/end, so they cannot tell Alloy's logs from promtail's
    # leftovers. Prove a fresh line: write a unique marker to oms-core's own stdout
    # (PID 1, i.e. the container log) after promtail is gone, and find it in Loki.
    $marker = "spec0032-log-marker-$(New-HexId 12)"
    & docker compose exec -T oms-core sh -c "echo $marker > /proc/1/fd/1" *> $null
    Add-Result 'AC-5' 'marker written to oms-core container stdout' ($LASTEXITCODE -eq 0) "marker=$marker"

    $markerQuery = @{ query = "{compose_service=`"oms-core`"} |= `"$marker`""; start = "$LogsSinceNs" }
    $markerOk = Wait-Until {
        $r = Invoke-RestMethod -Uri 'http://localhost:3100/loki/api/v1/query_range' -Body $markerQuery -TimeoutSec 10 -ErrorAction Stop
        @($r.data.result | ForEach-Object { $_.values } | Where-Object { $_[1] -eq $marker }).Count -gt 0
    } 90 "loki returns the fresh oms-core line '$marker'"
    Add-Result 'AC-5' 'fresh oms-core container log line shipped to loki by alloy' $markerOk "marker=$marker"
}

# ---- AC-6: host OTLP endpoint (formerly jaeger's) delivers traces to tempo ----
function Check-HostTracePath {
    Write-Host '  [AC-6] host OTLP :4318 -> alloy -> tempo'
    $traceId = New-HexId 32
    $spanId = New-HexId 16
    $now = Get-UnixNanos
    $json = @"
{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"spec0032-smoke"}}]},
 "scopeSpans":[{"spans":[{"traceId":"$traceId","spanId":"$spanId","name":"spec0032-smoke","kind":1,
 "startTimeUnixNano":"$($now - 1000000)","endTimeUnixNano":"$now"}]}]}]}
"@
    $code = Send-OtlpJson 'traces' $json
    Add-Result 'AC-6' 'POST localhost:4318/v1/traces' ($code -eq 200) "status=$code traceId=$traceId"

    # Tempo may answer 200 for an unknown id, so require the posted span in the body
    $ok = Wait-Until {
        $resp = Invoke-WebRequest -Uri "http://localhost:3200/api/v2/traces/$traceId" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        ($resp.StatusCode -eq 200) -and ($resp.Content -match 'spec0032-smoke')
    } 60 "tempo returns trace $traceId"
    Add-Result 'AC-6' 'tempo GET /api/v2/traces/<traceId> = 200 with the posted span' $ok "traceId=$traceId"
}

# ---- AC-7: compose oms-core sends OTLP to alloy and samples everything ----
function Check-CoreTracingEnv {
    Write-Host '  [AC-7] oms-core tracing env'
    $url = (& docker compose exec -T oms-core printenv TRACING_URL) -join ''
    Add-Result 'AC-7' 'oms-core TRACING_URL=http://alloy:4317' ($url -eq 'http://alloy:4317') "got: '$url'"
    $prob = (& docker compose exec -T oms-core printenv MANAGEMENT_TRACING_SAMPLING_PROBABILITY) -join ''
    Add-Result 'AC-7' 'oms-core MANAGEMENT_TRACING_SAMPLING_PROBABILITY=1.0' ($prob -eq '1.0') "got: '$prob'"
}

# ---- AC-8: OTLP logs reach loki and OTLP metrics reach mimir through alloy ----
function Check-OtlpLogsAndMetrics {
    Write-Host '  [AC-8] OTLP logs -> loki, OTLP metrics -> mimir'
    $body = "spec0032-smoke-$(New-HexId 12)"
    $now = Get-UnixNanos
    $logJson = @"
{"resourceLogs":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"spec0032-smoke"}}]},
 "scopeLogs":[{"logRecords":[{"timeUnixNano":"$now","severityText":"INFO","body":{"stringValue":"$body"}}]}]}]}
"@
    $code = Send-OtlpJson 'logs' $logJson
    Add-Result 'AC-8' 'POST localhost:4318/v1/logs' ($code -eq 200) "status=$code body=$body"

    # Mimir's native OTLP keeps the name as sent (no _total suffixing), so post the literal name.
    # The run_id data-point attribute becomes a label, so an earlier run's sample (still inside
    # Mimir's 5m lookback) cannot satisfy the query.
    $runId = New-HexId 12
    $metricJson = @"
{"resourceMetrics":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"spec0032-smoke"}}]},
 "scopeMetrics":[{"metrics":[{"name":"spec0032_smoke_total","sum":{"aggregationTemporality":2,"isMonotonic":true,
 "dataPoints":[{"asDouble":1,"startTimeUnixNano":"$($now - 1000000000)","timeUnixNano":"$now",
 "attributes":[{"key":"run_id","value":{"stringValue":"$runId"}}]}]}}]}]}]}
"@
    $code = Send-OtlpJson 'metrics' $metricJson
    Add-Result 'AC-8' 'POST localhost:4318/v1/metrics' ($code -eq 200) "status=$code"

    $logQuery = @{ query = "{service_name=`"spec0032-smoke`"} |= `"$body`""; start = "$($now - 60000000000)" }
    $logOk = Wait-Until {
        $r = Invoke-RestMethod -Uri 'http://localhost:3100/loki/api/v1/query_range' -Body $logQuery -TimeoutSec 10 -ErrorAction Stop
        @($r.data.result | ForEach-Object { $_.values } | Where-Object { $_[1] -eq $body }).Count -gt 0
    } 90 "loki query_range returns '$body'"
    Add-Result 'AC-8' 'loki query_range returns the OTLP log line' $logOk "body=$body"

    $metricQuery = @{ query = "spec0032_smoke_total{run_id=`"$runId`"}" }
    $metricOk = Wait-Until {
        $r = Invoke-RestMethod -Uri 'http://localhost:9009/prometheus/api/v1/query' -Body $metricQuery -TimeoutSec 10 -ErrorAction Stop
        @($r.data.result).Count -gt 0
    } 90 "mimir query spec0032_smoke_total{run_id=`"$runId`"} returns a sample"
    Add-Result 'AC-8' 'mimir query returns this run''s spec0032_smoke_total' $metricOk "run_id=$runId"
}

# ---- run all checks ----
$script:Results = New-Object System.Collections.Generic.List[object]
$script:ProjectName = $null

Write-Host '== SPEC-0032 LGTM stack smoke test =='
Check-Config
Remove-ObsoleteContainers
Wait-StackHealthy
# Telemetry paths first: the Tempo datasource health check is only meaningful once Tempo holds data
Check-HostTracePath
Check-OtlpLogsAndMetrics
Check-GrafanaDatasources
Check-MimirScrape
Check-LokiLabels
Check-CoreTracingEnv

Write-Host ''
Write-Host '== summary =='
$failedAcs = @($Results | Where-Object { -not $_.Pass } | ForEach-Object { $_.Ac } | Sort-Object -Unique)
if ($failedAcs.Count -eq 0) {
    Write-Host 'ALL CHECKS PASS (AC-1..AC-8)'
    exit 0
} else {
    Write-Host ("FAILED ACs: {0}" -f ($failedAcs -join ', '))
    $Results | Where-Object { -not $_.Pass } | Format-Table Ac, Name, Detail -AutoSize | Out-String | Write-Host
    exit 1
}
