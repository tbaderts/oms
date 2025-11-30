<#
.SYNOPSIS
    ReadySet Cache Metrics Dashboard
.DESCRIPTION
    Displays key caching metrics from ReadySet without needing Prometheus
.EXAMPLE
    .\readyset-metrics.ps1
    .\readyset-metrics.ps1 -ReadySetHost "localhost" -MetricsPort 6034
#>

param(
    [string]$ReadySetHost = "localhost",
    [int]$MetricsPort = 6034,
    [int]$SqlPort = 5433,
    [string]$PostgresContainer = "postgres",
    [string]$DbUser = "postgres",
    [string]$DbPassword = "changeme"
)

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "          ReadySet Cache Metrics Dashboard                        " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Function to fetch metrics from HTTP endpoint
function Get-ReadySetMetrics {
    try {
        $uri = "http://${ReadySetHost}:${MetricsPort}/metrics"
        $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 5
        return $response.Content
    } catch {
        Write-Host "Could not connect to ReadySet metrics endpoint" -ForegroundColor Red
        Write-Host "Make sure port 6034 is exposed in docker-compose.yml" -ForegroundColor Yellow
        return $null
    }
}

# Function to run SQL query against ReadySet
function Invoke-ReadySetQuery {
    param([string]$Query)
    try {
        $env:PGPASSWORD = $DbPassword
        $result = docker exec -e PGPASSWORD=$DbPassword $PostgresContainer psql -h readyset -p $SqlPort -U $DbUser -t -A -c $Query 2>&1
        return $result
    } catch {
        return $null
    }
}

# ==================== SECTION 1: ReadySet Status ====================
Write-Host "------------------------------------------------------------------" -ForegroundColor White
Write-Host " 1. READYSET STATUS" -ForegroundColor White
Write-Host "------------------------------------------------------------------" -ForegroundColor White

$statusQuery = "SHOW READYSET STATUS"
$statusResult = Invoke-ReadySetQuery $statusQuery
if ($statusResult -and $statusResult -notmatch "error") {
    $lines = $statusResult -split [Environment]::NewLine
    foreach ($line in $lines) {
        if ($line -match "^(.+?)\|(.+)$") {
            $name = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            if ($value -eq "Connected" -or $value -eq "Online") {
                Write-Host "   ${name}: " -NoNewline
                Write-Host $value -ForegroundColor Green
            } else {
                Write-Host "   ${name}: $value"
            }
        }
    }
} else {
    Write-Host "   Could not connect to ReadySet" -ForegroundColor Red
}

# ==================== SECTION 2: Active Caches ====================
Write-Host ""
Write-Host "------------------------------------------------------------------" -ForegroundColor White
Write-Host " 2. ACTIVE CACHES" -ForegroundColor White
Write-Host "------------------------------------------------------------------" -ForegroundColor White

$cachesResult = Invoke-ReadySetQuery "SHOW CACHES"
$cacheCount = 0
$totalHits = 0

if ($cachesResult) {
    $cacheLines = $cachesResult -split [Environment]::NewLine
    foreach ($line in $cacheLines) {
        if ($line -match "^q_") {
            $cacheCount++
            # Extract hit count (last number in the line)
            if ($line -match "(\d+)\s*$") {
                $totalHits += [int]$Matches[1]
            }
        }
    }
}

if ($cacheCount -gt 0) {
    Write-Host "   Active Caches: " -NoNewline
    Write-Host $cacheCount -ForegroundColor Green
} else {
    Write-Host "   Active Caches: " -NoNewline
    Write-Host "0" -ForegroundColor Yellow
}

Write-Host "   Total Cache Hits: " -NoNewline
if ($totalHits -gt 0) {
    Write-Host $totalHits -ForegroundColor Green
} else {
    Write-Host $totalHits -ForegroundColor Yellow
}

# ==================== SECTION 3: Prometheus Metrics ====================
Write-Host ""
Write-Host "------------------------------------------------------------------" -ForegroundColor White
Write-Host " 3. QUERY LATENCY METRICS" -ForegroundColor White
Write-Host "------------------------------------------------------------------" -ForegroundColor White

$metrics = Get-ReadySetMetrics
if ($metrics) {
    # Parse metrics
    $upstreamP50 = $null
    $upstreamP99 = $null
    $upstreamCount = 0
    $readysetP50 = $null
    $readysetP99 = $null
    $readysetCount = 0
    
    $lines = $metrics -split [Environment]::NewLine
    foreach ($line in $lines) {
        # Upstream metrics
        if ($line -match 'database_type="upstream"' -and $line -match 'quantile="0\.5"' -and $line -match 'execution_time') {
            if ($line -match "\s(\d+\.?\d*)\s*$") {
                $upstreamP50 = [double]$Matches[1]
            }
        }
        if ($line -match 'database_type="upstream"' -and $line -match 'quantile="0\.99"' -and $line -match 'execution_time') {
            if ($line -match "\s(\d+\.?\d*)\s*$") {
                $upstreamP99 = [double]$Matches[1]
            }
        }
        if ($line -match 'execution_time_us_count.*database_type="upstream"') {
            if ($line -match "\s(\d+)\s*$") {
                $upstreamCount = [int]$Matches[1]
            }
        }
        
        # ReadySet cache metrics
        if ($line -match 'database_type="readyset"' -and $line -match 'quantile="0\.5"' -and $line -match 'execution_time') {
            if ($line -match "\s(\d+\.?\d*)\s*$") {
                $readysetP50 = [double]$Matches[1]
            }
        }
        if ($line -match 'database_type="readyset"' -and $line -match 'quantile="0\.99"' -and $line -match 'execution_time') {
            if ($line -match "\s(\d+\.?\d*)\s*$") {
                $readysetP99 = [double]$Matches[1]
            }
        }
        if ($line -match 'execution_time_us_count.*database_type="readyset"') {
            if ($line -match "\s(\d+)\s*$") {
                $readysetCount = [int]$Matches[1]
            }
        }
    }
    
    Write-Host ""
    Write-Host "   Upstream (PostgreSQL) Queries:" -ForegroundColor Yellow
    if ($upstreamCount -gt 0) {
        Write-Host "     Query Count: $upstreamCount"
        if ($upstreamP50) { 
            $latencyMs = [math]::Round($upstreamP50 / 1000, 2)
            Write-Host "     P50 Latency: $latencyMs ms" 
        }
        if ($upstreamP99) { 
            $latencyMs = [math]::Round($upstreamP99 / 1000, 2)
            Write-Host "     P99 Latency: $latencyMs ms" 
        }
    } else {
        Write-Host "     No upstream queries recorded yet" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "   ReadySet Cache Queries:" -ForegroundColor Green
    if ($readysetCount -gt 0) {
        Write-Host "     Query Count: $readysetCount"
        if ($readysetP50) { 
            $latencyMs = [math]::Round($readysetP50 / 1000, 2)
            Write-Host "     P50 Latency: $latencyMs ms" 
        }
        if ($readysetP99) { 
            $latencyMs = [math]::Round($readysetP99 / 1000, 2)
            Write-Host "     P99 Latency: $latencyMs ms" 
        }
    } else {
        Write-Host "     No cache queries recorded yet" -ForegroundColor Gray
    }
    
    # ==================== SECTION 4: Cache Hit Rate ====================
    Write-Host ""
    Write-Host "------------------------------------------------------------------" -ForegroundColor White
    Write-Host " 4. CACHE HIT RATE" -ForegroundColor White
    Write-Host "------------------------------------------------------------------" -ForegroundColor White
    
    $totalQueries = $upstreamCount + $readysetCount
    if ($totalQueries -gt 0) {
        $hitRate = [math]::Round(($readysetCount / $totalQueries) * 100, 1)
        
        # Create visual bar
        $filledBlocks = [math]::Floor($hitRate / 5)
        $emptyBlocks = 20 - $filledBlocks
        $hitBar = ("*" * $filledBlocks) + ("-" * $emptyBlocks)
        
        Write-Host ""
        if ($hitRate -ge 80) {
            Write-Host "   Cache Hit Rate: $hitRate%" -ForegroundColor Green
            Write-Host "   [$hitBar]" -ForegroundColor Green
        } elseif ($hitRate -ge 50) {
            Write-Host "   Cache Hit Rate: $hitRate%" -ForegroundColor Yellow
            Write-Host "   [$hitBar]" -ForegroundColor Yellow
        } else {
            Write-Host "   Cache Hit Rate: $hitRate%" -ForegroundColor Red
            Write-Host "   [$hitBar]" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "   Total Queries: $totalQueries" -ForegroundColor Gray
        Write-Host "   Cache Hits:    $readysetCount" -ForegroundColor Green
        Write-Host "   Cache Misses:  $upstreamCount" -ForegroundColor Yellow
        
        # Speedup calculation
        if ($upstreamP50 -and $readysetP50 -and $readysetP50 -gt 0) {
            $speedup = [math]::Round($upstreamP50 / $readysetP50, 1)
            Write-Host ""
            Write-Host "   Cache Speedup: ${speedup}x faster" -ForegroundColor Cyan
        }
    } else {
        Write-Host ""
        Write-Host "   No queries recorded yet. Run some queries first!" -ForegroundColor Gray
    }

    # ==================== SECTION 5: Memory Usage ====================
    Write-Host ""
    Write-Host "------------------------------------------------------------------" -ForegroundColor White
    Write-Host " 5. RESOURCE USAGE" -ForegroundColor White
    Write-Host "------------------------------------------------------------------" -ForegroundColor White
    
    $residentBytes = $null
    $connections = $null
    $upstreamConns = $null
    
    foreach ($line in $lines) {
        if ($line -match "^readyset_allocator_resident_bytes.*\s(\d+)\s*$") {
            $residentBytes = [long]$Matches[1]
        }
        if ($line -match "^readyset_noria_client_connected_clients.*\s(\d+)\s*$") {
            $connections = [int]$Matches[1]
        }
        if ($line -match "^readyset_client_upstream_connections.*\s(\d+)\s*$") {
            $upstreamConns = [int]$Matches[1]
        }
    }
    
    Write-Host ""
    if ($residentBytes) {
        $memoryMB = [math]::Round($residentBytes / 1024 / 1024, 1)
        Write-Host "   Memory Usage: $memoryMB MB"
    }
    if ($connections) {
        Write-Host "   Client Connections: $connections"
    }
    if ($upstreamConns) {
        Write-Host "   Upstream (PG) Connections: $upstreamConns"
    }
}

# ==================== SECTION 6: Replicated Tables ====================
Write-Host ""
Write-Host "------------------------------------------------------------------" -ForegroundColor White
Write-Host " 6. REPLICATED TABLES" -ForegroundColor White
Write-Host "------------------------------------------------------------------" -ForegroundColor White

$tablesResult = Invoke-ReadySetQuery "SHOW READYSET TABLES"
if ($tablesResult) {
    $tableLines = $tablesResult -split [Environment]::NewLine
    $onlineCount = 0
    
    Write-Host ""
    foreach ($line in $tableLines) {
        if ($line -match '"public"\."(\w+)"\s*\|\s*(\w+)') {
            $tableName = $Matches[1]
            $status = $Matches[2]
            if ($status -eq "Online") {
                $onlineCount++
                Write-Host "   $tableName : " -NoNewline
                Write-Host "Online" -ForegroundColor Green
            } else {
                Write-Host "   $tableName : " -NoNewline
                Write-Host $status -ForegroundColor Yellow
            }
        }
    }
    Write-Host ""
    Write-Host "   Total Tables Online: $onlineCount" -ForegroundColor Green
}

# ==================== Quick Commands ====================
Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Quick Commands" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  # Test query and check cache hit:" -ForegroundColor Gray
Write-Host '  docker exec -e PGPASSWORD=changeme postgres psql -h readyset -p 5433 -U postgres `' -ForegroundColor White
Write-Host '    -c "SELECT * FROM orders WHERE symbol = ''INTC'' LIMIT 5" `' -ForegroundColor White
Write-Host '    -c "EXPLAIN LAST STATEMENT"' -ForegroundColor White
Write-Host ""
Write-Host "  # Re-run this script:" -ForegroundColor Gray
Write-Host "  .\scripts\readyset-metrics.ps1" -ForegroundColor White
Write-Host ""
