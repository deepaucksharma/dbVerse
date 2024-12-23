#!/bin/bash
set -eo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

check_postgres() {
    pg_isready -U postgres -h localhost > /dev/null 2>&1
}

check_extensions() {
    local required_extensions=(
        "pg_stat_statements"
        "pg_wait_sampling"
        "pg_stat_monitor"
    )
    
    for ext in "${required_extensions[@]}"; do
        if ! psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_extension WHERE extname = '$ext';" | grep -q 1; then
            log "Extension $ext is not properly loaded"
            return 1
        fi
    done
    return 0
}

verify_preload_libraries() {
    local libs
    libs="$(psql -U postgres -tAc "SHOW shared_preload_libraries;")"
    for lib in pg_stat_statements pg_wait_sampling pg_stat_monitor; do
        if [[ "$libs" != *"$lib"* ]]; then
            log "ERROR: $lib not found in shared_preload_libraries"
            return 1
        fi
    done
    return 0
}

max_attempts=3
attempt=1

while [ $attempt -le $max_attempts ]; do
    if check_postgres && verify_preload_libraries && check_extensions; then
        log "All extensions and libraries verified successfully"
        exit 0
    fi
    
    log "Verification attempt $attempt of $max_attempts failed, retrying..."
    sleep 5
    attempt=$((attempt + 1))
done

log "ERROR: Failed to verify PostgreSQL setup after $max_attempts attempts"
exit 1
