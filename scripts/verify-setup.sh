#!/bin/bash

# Check if all required services are running
echo "Checking service status..."

services=("mssql-db" "hr-portal" "payroll-system" "performance-review" "admin-console")

for service in "${services[@]}"
do
    if docker ps | grep -q $service
    then
        echo "$service is running"
    else
        echo "ERROR: $service is not running"
        exit 1
    fi
done

# Check database connectivity
echo "Checking database connectivity..."
docker exec mssql-db /opt/mssql-tools/bin/sqlcmd \
    -S localhost \
    -U sa \
    -P "$MSSQL_SA_PASSWORD" \
    -Q "SELECT @@VERSION"

# Check service health endpoints
check_health() {
    local service=$1
    local port=$2
    curl -s "http://localhost:$port/health" | grep -q "ok" && \
        echo "$service health check passed" || \
        echo "$service health check failed"
}

check_health "hr-portal" "3000"
check_health "payroll-system" "3001"
check_health "performance-review" "3002"
check_health "admin-console" "3003"
