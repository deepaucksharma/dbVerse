#!/bin/bash
set -euo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

AGENT_DIR="/var/run/newrelic-infra"
AGENT_PID="$AGENT_DIR/newrelic-infra.pid"
LOG_DIR="/var/log/newrelic-infra"

log "Running post-initialization checks..."

wait_for_postgres() {
    local retries=30
    local connected=false
    
    while [ $retries -gt 0 ]; do
        if pg_isready -U "$POSTGRES_USER" -h localhost > /dev/null 2>&1; then
            connected=true
            break
        fi
        retries=$((retries - 1))
        sleep 1
    done
    
    if ! $connected; then
        log "ERROR: Postgres not responding after 30 seconds"
        return 1
    fi
    
    log "Postgres is ready!"
    return 0
}

verify_postgres_config() {
    log "Verifying PostgreSQL configuration..."
    
    local PRELOAD_LIBS
    PRELOAD_LIBS=$(psql -U "$POSTGRES_USER" -tAc "SHOW shared_preload_libraries;")
    log "Current shared_preload_libraries: ${PRELOAD_LIBS}"
    
    local required_libs=("pg_stat_statements" "pg_stat_monitor" "pg_wait_sampling")
    local missing_libs=()
    
    for lib in "${required_libs[@]}"; do
        if [[ "${PRELOAD_LIBS}" != *"${lib}"* ]]; then
            missing_libs+=("$lib")
        fi
    done
    
    if [ ${#missing_libs[@]} -ne 0 ]; then
        log "ERROR: Missing required libraries: ${missing_libs[*]}"
        return 1
    fi
    
    log "All required libraries are present."
    return 0
}

verify_newrelic_agent() {
    local retries=3
    local retry=0
    
    while [ $retry -lt $retries ]; do
        if [ -x "/usr/local/newrelic-infra/bin/newrelic-infra" ]; then
            if [ ! -f "$AGENT_PID" ]; then
                log "Starting New Relic infra agent..."
                /usr/local/newrelic-infra/bin/newrelic-infra &> "$LOG_DIR/agent.log" &
                echo $! > "$AGENT_PID"
                log "New Relic infra agent started (PID: $(cat "$AGENT_PID"))"
                return 0
            else
                if kill -0 "$(cat "$AGENT_PID")" 2>/dev/null; then
                    log "New Relic infra agent is already running"
                    return 0
                else
                    log "Stale PID file found, cleaning up..."
                    rm -f "$AGENT_PID"
                fi
            fi
        else
            log "ERROR: New Relic infra agent binary not found or not executable."
            return 1
        fi
        retry=$((retry + 1))
        sleep 2
    done
    
    return 1
}

main() {
    if ! wait_for_postgres; then
        log "ERROR: PostgreSQL startup verification failed"
        exit 1
    fi

    if ! verify_postgres_config; then
        log "ERROR: PostgreSQL configuration verification failed"
        exit 1
    fi

    if ! verify_newrelic_agent; then
        log "ERROR: New Relic agent verification failed"
        exit 1
    fi

    log "Post-initialization checks completed successfully."
}

main
