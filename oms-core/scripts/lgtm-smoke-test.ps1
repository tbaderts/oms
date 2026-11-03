# LGTM stack smoke test: SPEC-0032's AC-1..AC-3, AC-6 and AC-8 (the stack itself), and SPEC-0033's
# AC-6 (the services report over OTLP), labelled S33-AC-6. SPEC-0033 replaced SPEC-0032's AC-4
# (oms-core scrape), AC-5 (oms-core stdout in Loki) and AC-7 (TRACING_URL). SPEC-0038's AC-4..AC-6
# (dashboards, their queries, the Grafana MCP server) are labelled S38-AC-n.
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
$AppServices = @('postgres', 'broker', 'schema-registry', 'alloy', 'oms-core', 'exchange-simulator', 'streaming-service', 'mcp-server')
# Minimum image versions (AC-1)
$MinImages = [ordered]@{
    'alloy'   = @{ Repo = 'grafana/alloy';   Min = '1.21.3' }
    'mimir'   = @{ Repo = 'grafana/mimir';   Min = '3.2.4' }
    'tempo'   = @{ Repo = 'grafana/tempo';   Min = '3.1.1' }
    'loki'    = @{ Repo = 'grafana/loki';    Min = '3.7.9' }
    'grafana' = @{ Repo = 'grafana/grafana'; Min = '13.3.0' }
}

function Get-UnixNanos { [int64][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() * 1000000 }

# Set by Remove-ObsoleteContainers once promtail is gone; the Loki queries start here
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

# ---- SPEC-0033 AC-6: the services push traces, metrics and logs over OTLP ----
# Replaces SPEC-0032's AC-4 (the oms-core scrape), AC-5 (oms-core stdout in Loki) and AC-7
# (TRACING_URL). One order through oms-core and the simulator gives a trace that both report in.
function Invoke-Loki {
    param([string]$Query)
    $body = @{ query = $Query; start = "$LogsSinceNs"; limit = '100' }
    $r = Invoke-RestMethod -Uri 'http://localhost:3100/loki/api/v1/query_range' -Body $body -TimeoutSec 10 -ErrorAction Stop
    @($r.data.result)
}

function Invoke-Mimir {
    param([string]$Query)
    $r = Invoke-RestMethod -Uri 'http://localhost:9009/prometheus/api/v1/query' -Body @{ query = $Query } -TimeoutSec 10 -ErrorAction Stop
    @($r.data.result)
}

function Check-ServiceTelemetry {
    Write-Host '  [S33-AC-6] oms-core and the exchange simulator report over OTLP'
    & docker compose up -d @AppServices *> $null
    Add-Result 'S33-AC-6' "docker compose up -d $($AppServices -join ' ')" ($LASTEXITCODE -eq 0) "exit=$LASTEXITCODE"

    # compose service -> OTLP service.name
    $services = [ordered]@{ 'oms-core' = 'oms-core'; 'exchange-simulator' = 'oms-exchange-simulator' }

    foreach ($svc in $services.Keys) {
        $enabled = (& docker compose exec -T $svc printenv OTLP_EXPORT_ENABLED) -join ''
        $endpoint = (& docker compose exec -T $svc printenv OTLP_ENDPOINT) -join ''
        $legacy = (& docker compose exec -T $svc printenv TRACING_URL) -join ''
        $ok = ($enabled -eq 'true') -and ($endpoint -eq 'http://alloy:4318') -and ($legacy -eq '')
        Add-Result 'S33-AC-6' "$svc OTLP_EXPORT_ENABLED=true, OTLP_ENDPOINT=http://alloy:4318, no TRACING_URL" $ok `
            "enabled='$enabled' endpoint='$endpoint' TRACING_URL='$legacy'"
    }

    $up = Wait-Until { (Get-HttpStatus 'http://localhost:8090/actuator/health') -eq 200 } 120 'oms-core healthy'
    Add-Result 'S33-AC-6' 'oms-core /actuator/health 200' $up

    # A market order: the simulator acks and fills it over Kafka
    $orderId = ''
    try {
        $order = '{"type":"OrderCreateCmd","version":"1.0.0","order":{"sessionId":"SES-SMOKE","clOrdId":"CL-smoke-' + (New-HexId 12) + '","symbol":"AAPL","account":"ACC-SMOKE","ordType":"MARKET","orderQty":10,"side":"BUY"}}'
        $orderId = (Invoke-RestMethod -Uri 'http://localhost:8090/api/command/execute' -Method Post -ContentType 'application/json' `
            -Body $order -TimeoutSec 10 -ErrorAction Stop).id
    } catch { }
    Add-Result 'S33-AC-6' 'order created through oms-core' ($orderId -ne '' -and $null -ne $orderId) "orderId=$orderId"

    # Logs: oms-core's record of the simulator's ack, with its trace id
    $script:SmokeTraceId = ''
    $coreLog = Wait-Until {
        $streams = Invoke-Loki "{service_name=`"oms-core`"} |= `"Processed OrderAcceptCmd`" |= `"$orderId`" | trace_id != `"`""
        $ids = @($streams | ForEach-Object { $_.stream.trace_id } | Where-Object { $_ })
        if ($ids.Count -gt 0) { $script:SmokeTraceId = $ids[0]; $true } else { $false }
    } 90 "loki has oms-core's log of the ack for $orderId, with a trace_id"
    Add-Result 'S33-AC-6' 'oms-core logs in loki by service_name, with trace_id' $coreLog "trace_id=$SmokeTraceId"

    $simLog = Wait-Until {
        @(Invoke-Loki "{service_name=`"oms-exchange-simulator`"} |= `"$orderId`" | trace_id = `"$SmokeTraceId`"").Count -gt 0
    } 60 "loki has the simulator's log for $orderId in trace $SmokeTraceId"
    Add-Result 'S33-AC-6' 'oms-exchange-simulator logs in loki by service_name, in the same trace' $simLog "trace_id=$SmokeTraceId"

    $copies = @()
    try { $copies = @(Invoke-Loki '{compose_service=~"oms-core|exchange-simulator"}') } catch { }
    Add-Result 'S33-AC-6' 'no copy of their stdout in loki (compose_service streams empty)' ($copies.Count -eq 0) "streams=$($copies.Count)"

    # Traces: the trace holds spans of both services
    $trace = Wait-Until {
        $resp = Invoke-WebRequest -Uri "http://localhost:3200/api/v2/traces/$SmokeTraceId" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        ($resp.StatusCode -eq 200) -and ($resp.Content -match '"oms-core"') -and ($resp.Content -match '"oms-exchange-simulator"')
    } 60 "tempo returns trace $SmokeTraceId with spans of both services"
    Add-Result 'S33-AC-6' 'tempo trace spans oms-core and oms-exchange-simulator' $trace "trace_id=$SmokeTraceId"

    # Metrics: pushed with the resource attributes as labels; the old scrape is gone
    foreach ($name in @($services.Values) + @('oms-streaming-service', 'oms-mcp-server')) {
        $ok = Wait-Until { @(Invoke-Mimir "count({service_name=`"$name`"})").Count -gt 0 } 90 "mimir has series with service_name=$name"
        Add-Result 'S33-AC-6' "mimir series with service_name=$name" $ok
    }
    $scraped = @()
    try { $scraped = @(Invoke-Mimir 'timestamp(up{job="oms-core"}) > time() - 60') } catch { }
    Add-Result 'S33-AC-6' 'no fresh up{job="oms-core"} sample (scrape removed)' ($scraped.Count -eq 0) "series=$($scraped.Count)"

    # Infrastructure containers still have their stdout shipped (the broker: postgres runs as a user
    # that cannot write to its PID 1 stdout)
    $marker = "spec0033-log-marker-$(New-HexId 12)"
    & docker compose exec -T broker sh -c "echo $marker > /proc/1/fd/1" *> $null
    Add-Result 'S33-AC-6' 'marker written to broker container stdout' ($LASTEXITCODE -eq 0) "marker=$marker"
    $infra = Wait-Until {
        @(Invoke-Loki "{compose_service=`"broker`"} |= `"$marker`"" | ForEach-Object { $_.values } | Where-Object { $_[1] -eq $marker }).Count -gt 0
    } 90 "loki returns the fresh broker line '$marker'"
    Add-Result 'S33-AC-6' 'infrastructure container log shipped to loki by alloy' $infra "marker=$marker"
}


# ---- SPEC-0038: dashboards provisioned, their queries return data, the Grafana MCP server ----
# Runs after Check-ServiceTelemetry, whose order gives the order-flow metrics something to count.
function Invoke-Mcp {
    param([string]$Json)
    $resp = Invoke-WebRequest -Uri 'http://localhost:8096/mcp' -Method Post -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop `
        -ContentType 'application/json' -Headers @{ Accept = 'application/json, text/event-stream' } -Body $Json
    # A JSON body, or an SSE stream whose data: lines carry the JSON-RPC message
    $text = [string]$resp.Content
    if ($text.TrimStart().StartsWith('{')) { return $text }
    (($text -split "`n") | Where-Object { $_ -like 'data:*' } | ForEach-Object { $_.Substring(5).Trim() }) -join "`n"
}

function Check-Dashboards {
    Write-Host '  [S38] OMS dashboards and the Grafana MCP server'
    & docker compose up -d grafana grafana-mcp *> $null
    Add-Result 'S38-AC-4' 'docker compose up -d grafana grafana-mcp' ($LASTEXITCODE -eq 0) "exit=$LASTEXITCODE"

    # AC-4: provisioned from the repository, in folder OMS
    $encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:$AdminPassword"))
    $headers = @{ Authorization = "Basic $encoded" }
    $script:found = @()
    $ok = Wait-Until {
        $resp = Invoke-RestMethod -Uri 'http://localhost:3000/api/search?type=dash-db&query=OMS' -Headers $headers -TimeoutSec 10 -ErrorAction Stop
        $script:found = @(@($resp) | Where-Object { $_.folderTitle -eq 'OMS' } | ForEach-Object { $_.uid })
        ($script:found -contains 'oms-overview') -and ($script:found -contains 'oms-services')
    } 60 'grafana lists oms-overview and oms-services in folder OMS'
    Add-Result 'S38-AC-4' 'dashboards oms-overview and oms-services provisioned in folder OMS' $ok "uids=$($script:found -join ',')"

    # AC-5: every Mimir query of both dashboards returns data
    foreach ($file in @('oms-overview.json', 'oms-services.json')) {
        $dashboard = Get-Content -Raw -Path (Join-Path $RepoRoot "oms-core\grafana\dashboards\$file") | ConvertFrom-Json
        foreach ($panel in @($dashboard.panels)) {
            foreach ($target in @($panel.targets)) {
                if ($target.datasource.uid -ne 'oms-mimir' -or -not $target.expr) { continue }
                $expr = $target.expr.Replace('$__rate_interval', '1m').Replace('$service_name', 'oms-core')
                # A fallback (" or on() vector(0)") always yields a series; for oms-core, which has
                # HTTP and a Kafka consumer, the query must return data without it too.
                # The server-errors query has no series without errors, so it is checked without the
                # outcome filter: that still proves the metric name resolves.
                $expr = $expr.Replace(' or on() vector(0)', '').Replace(', outcome="SERVER_ERROR"', '')
                $script:series = 0
                $hasData = Wait-Until {
                    $script:series = @(Invoke-Mimir $expr).Count
                    $script:series -gt 0
                } 90 "$file '$($panel.title)' returns data"
                Add-Result 'S38-AC-5' "$file / $($panel.title) [$($target.refId)]" $hasData "series=$script:series expr=$expr"
            }
        }
    }
    foreach ($eventType in @('NEW_ORDER', 'ACK', 'FILL')) {
        $counted = Wait-Until {
            @(Invoke-Mimir "oms_order_events{service_name=`"oms-core`", event=`"$eventType`"} > 0").Count -gt 0
        } 90 "oms_order_events{event=$eventType} > 0"
        Add-Result 'S38-AC-5' "oms_order_events counts $eventType" $counted
    }

    # AC-6: the MCP server answers, offers the dashboard search and finds both dashboards
    $initialized = Wait-Until {
        $r = Invoke-Mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"lgtm-smoke-test","version":"1"}}}'
        $null -ne ($r | ConvertFrom-Json).result.capabilities.tools
    } 60 'grafana-mcp answers initialize'
    Add-Result 'S38-AC-6' 'MCP initialize on localhost:8096/mcp' $initialized

    $tools = @()
    try { $tools = @((Invoke-Mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | ConvertFrom-Json).result.tools | ForEach-Object { $_.name }) } catch { }
    Add-Result 'S38-AC-6' 'tools/list contains search_dashboards' ($tools -contains 'search_dashboards') "tools=$($tools.Count)"

    $text = ''
    try {
        $r = Invoke-Mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_dashboards","arguments":{"query":"OMS"}}}' | ConvertFrom-Json
        $text = (@($r.result.content) | ForEach-Object { $_.text }) -join ' '
    } catch { $text = $_.Exception.Message }
    Add-Result 'S38-AC-6' 'search_dashboards("OMS") returns both uids' (($text -match 'oms-overview') -and ($text -match 'oms-services'))

    $mcpJson = Get-Content -Raw -Path (Join-Path $RepoRoot '.mcp.json') | ConvertFrom-Json
    Add-Result 'S38-AC-6' '.mcp.json registers grafana at http://localhost:8096/mcp' ($mcpJson.mcpServers.grafana.url -eq 'http://localhost:8096/mcp')
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

Write-Host '== LGTM stack smoke test (SPEC-0032, SPEC-0033, SPEC-0038) =='
Check-Config
Remove-ObsoleteContainers
Wait-StackHealthy
# Telemetry paths first: the Tempo datasource health check is only meaningful once Tempo holds data
Check-HostTracePath
Check-OtlpLogsAndMetrics
Check-GrafanaDatasources
Check-ServiceTelemetry
Check-Dashboards

Write-Host ''
Write-Host '== summary =='
$failedAcs = @($Results | Where-Object { -not $_.Pass } | ForEach-Object { $_.Ac } | Sort-Object -Unique)
if ($failedAcs.Count -eq 0) {
    Write-Host 'ALL CHECKS PASS'
    exit 0
} else {
    Write-Host ("FAILED ACs: {0}" -f ($failedAcs -join ', '))
    $Results | Where-Object { -not $_.Pass } | Format-Table Ac, Name, Detail -AutoSize | Out-String | Write-Host
    exit 1
}
