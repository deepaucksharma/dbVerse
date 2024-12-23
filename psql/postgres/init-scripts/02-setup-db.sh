#!/bin/bash
set -eo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Use postgres home directory where we have permissions
WORK_DIR="/var/lib/postgresql/import_data"
mkdir -p "$WORK_DIR" || {
    log "WARNING: Using fallback directory..."
    WORK_DIR="/tmp"
}

verify_sql_file() {
    local file=$1
    local line_count=0
    local size_bytes=0
    
    if [ ! -f "$file" ]; then
        return 1
    fi
    
    line_count=$(wc -l < "$file")
    size_bytes=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")
    
    # Basic sanity checks
    if [ "$line_count" -lt 10 ]; then
        log "WARNING: SQL file seems too small (${line_count} lines)"
        return 1
    fi
    
    if [ "$size_bytes" -gt 10737418240 ]; then # 10GB
        log "WARNING: SQL file is very large (${size_bytes} bytes)"
        return 1
    fi
    
    return 0
}

check_disk_space() {
    local file=$1
    local file_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file")
    local available_space=$(df -k "$(dirname "$file")" | awk 'NR==2 {print $4}')
    
    if [ "$((available_space * 1024))" -lt "$((file_size * 3))" ]; then
        log "ERROR: Insufficient disk space. Need $((file_size * 3 / 1024 / 1024))MB, have $((available_space / 1024))MB"
        return 1
    fi
    return 0
}

import_data() {
    local sql_file=$1
    local max_retries=3
    local retry=0
    
    # First, create a preprocessed version without schema creation
    local processed_file="${WORK_DIR}/processed_data.sql"
    grep -v "CREATE SCHEMA employees;" "$sql_file" > "$processed_file"
    
    while [ $retry -lt $max_retries ]; do
        if psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$processed_file"; then
            log "Data import completed successfully"
            return 0
        fi
        log "Import attempt $((retry + 1)) failed, retrying..."
        retry=$((retry + 1))
        sleep 5
    done
    
    log "ERROR: Failed to import data after $max_retries attempts"
    return 1
}

cleanup() {
    if [ -d "$WORK_DIR" ] && [ "$WORK_DIR" != "/tmp" ]; then
        log "Cleaning up temporary files..."
        rm -rf "${WORK_DIR:?}"/* 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

log "Checking for employees_data.sql or employees_data.sql.bz2..."

DATA_FILE=""
if [ -f "/docker-entrypoint-initdb.d/employees_data.sql.bz2" ]; then
    log "Found compressed SQL file, extracting..."
    if bunzip2 -c "/docker-entrypoint-initdb.d/employees_data.sql.bz2" > "$WORK_DIR/employees_data.sql" 2>/dev/null; then
        DATA_FILE="$WORK_DIR/employees_data.sql"
        log "Data file extracted successfully"
    else
        log "WARNING: Failed to extract bzip2 file, trying uncompressed file..."
    fi
fi

if [ -z "$DATA_FILE" ] && [ -f "/docker-entrypoint-initdb.d/employees_data.sql" ]; then
    log "Found uncompressed SQL file"
    if cp "/docker-entrypoint-initdb.d/employees_data.sql" "$WORK_DIR/employees_data.sql" 2>/dev/null; then
        DATA_FILE="$WORK_DIR/employees_data.sql"
    else
        log "WARNING: Failed to copy SQL file"
    fi
fi

if [ -z "$DATA_FILE" ]; then
    log "WARNING: No data file found or couldn't process files, proceeding with empty 'employees' database"
    exit 0
fi

# Verify and import if we have a valid file
if [ -f "$DATA_FILE" ]; then
    if ! verify_sql_file "$DATA_FILE"; then
        log "ERROR: SQL file verification failed"
        exit 1
    fi
    
    if ! check_disk_space "$DATA_FILE"; then
        log "ERROR: Insufficient disk space for import"
        exit 1
    fi
    
    log "Starting data import into 'employees' database..."
    if ! import_data "$DATA_FILE"; then
        log "ERROR: Data import failed"
        exit 1
    fi
fi

log "Database setup script finished successfully."