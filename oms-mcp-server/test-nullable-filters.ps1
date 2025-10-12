#!/usr/bin/env pwsh
# Test script for order search with optional filters

Write-Host "Testing Order Search MCP Tool with Nullable Filters" -ForegroundColor Cyan
Write-Host "=" * 60

# Test 1: Search by order type only
Write-Host "`nTest 1: Search LIMIT orders only" -ForegroundColor Yellow
curl -s "http://localhost:8090/api/query/orders?ordType=LIMIT&size=5" | jq '.content | length'

# Test 2: Search by symbol only  
Write-Host "`nTest 2: Search INTC orders only" -ForegroundColor Yellow
curl -s "http://localhost:8090/api/query/orders?symbol=INTC&size=5" | jq '.content | length'

# Test 3: Search by side only
Write-Host "`nTest 3: Search BUY orders only" -ForegroundColor Yellow
curl -s "http://localhost:8090/api/query/orders?side=BUY&size=5" | jq '.content | length'

# Test 4: Combined filters
Write-Host "`nTest 4: Search LIMIT + BUY orders" -ForegroundColor Yellow
curl -s "http://localhost:8090/api/query/orders?ordType=LIMIT&side=BUY&size=5" | jq '.content | length'

Write-Host "`n" -ForegroundColor Green
Write-Host "Tests completed! All should return results without requiring all filter fields." -ForegroundColor Green
