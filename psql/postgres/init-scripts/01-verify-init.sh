#!/bin/bash
set -euo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

verify_extension() {
    local ext=$1
    local max_retries=3
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
            "SELECT 1 FROM pg_extension WHERE extname = '$ext';" | grep -q 1; then
            return 0
        fi
        
        log "Extension $ext not found, attempting to create... (attempt $((retry + 1)))"
        if psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
            "CREATE EXTENSION IF NOT EXISTS $ext;" 2>/dev/null; then
            log "Successfully created extension $ext"
            return 0
        fi
        
        retry=$((retry + 1))
        sleep 5
    done
    
    return 1
}

log "Verifying initial setup..."

# Verify 'employees' schema
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.schemata
            WHERE schema_name = 'employees'
        ) THEN
            RAISE EXCEPTION 'Schema employees does not exist';
        END IF;
    END
    \$\$;
EOSQL

# Verify each extension
required_extensions=("pg_stat_statements" "pg_wait_sampling" "pg_stat_monitor" "pgcrypto")
failed_extensions=()

for ext in "${required_extensions[@]}"; do
    if ! verify_extension "$ext"; then
        failed_extensions+=("$ext")
    fi
done

if [ ${#failed_extensions[@]} -ne 0 ]; then
    log "ERROR: Failed to verify extensions: ${failed_extensions[*]}"
    exit 1
fi

log "Initial setup verification completed successfully."
