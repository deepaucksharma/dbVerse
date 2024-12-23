#!/bin/bash
set -eo pipefail

# --------------------------------------------------------
# Utility functions
# --------------------------------------------------------
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
    local setting
    setting="$(psql -U postgres -tAc "SHOW shared_preload_libraries;")"
    
    for lib in pg_stat_statements pg_wait_sampling pg_stat_monitor; do
        if [[ "$setting" != *"$lib"* ]]; then
            log "ERROR: $lib not found in shared_preload_libraries"
            return 1
        fi
    done
    return 0
}

# --------------------------------------------------------
# PostgreSQL initialization
# --------------------------------------------------------
initialize_postgres() {
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
        log "Initializing PostgreSQL data directory..."
        
        # Check if POSTGRES_PASSWORD is set
        if [ -z "$POSTGRES_PASSWORD" ]; then
            log "ERROR: POSTGRES_PASSWORD environment variable not set"
            exit 1
        fi

        # Initialize the database
        initdb -D "$PGDATA" \
            --username="$POSTGRES_USER" \
            --pwfile=<(echo "$POSTGRES_PASSWORD") \
            --auth=trust \
            --no-instructions || {
            log "ERROR: PostgreSQL initialization failed"
            exit 1
        }

        # Copy configuration files
        if [ -f "/etc/postgresql/postgresql.conf" ]; then
            log "Copying custom postgresql.conf..."
            cp /etc/postgresql/postgresql.conf "$PGDATA/postgresql.conf"
        fi
        
        if [ -f "/etc/postgresql/pg_hba.conf" ]; then
            log "Copying custom pg_hba.conf..."
            cp /etc/postgresql/pg_hba.conf "$PGDATA/pg_hba.conf"
        fi

        log "PostgreSQL initialization complete"
    else
        log "PostgreSQL data directory already initialized"
    fi

    # Always ensure proper permissions
    chown -R postgres:postgres "$PGDATA"
    chmod 0700 "$PGDATA"
}

# --------------------------------------------------------
# Cleanup logic
# --------------------------------------------------------
cleanup() {
    log "Performing cleanup..."

    if [ -f "/var/run/newrelic-infra/newrelic-infra.pid" ]; then
        log "Stopping New Relic Infrastructure agent..."
        kill -TERM "$(cat /var/run/newrelic-infra/newrelic-infra.pid)" 2>/dev/null || true
        rm -f "/var/run/newrelic-infra/newrelic-infra.pid"
        sleep 2
    fi
    
    if [ -f "$PGDATA/postmaster.pid" ]; then
        log "Stopping PostgreSQL..."
        pg_ctl stop -D "$PGDATA" -m fast
        sleep 2
    fi
}

trap cleanup EXIT INT TERM

# --------------------------------------------------------
# Start New Relic Infrastructure agent
# --------------------------------------------------------
AGENT_DIR="/var/run/newrelic-infra"
AGENT_PID="$AGENT_DIR/newrelic-infra.pid"

log "Starting New Relic infrastructure agent..."
if [ ! -d "$AGENT_DIR" ]; then
    log "Creating $AGENT_DIR with 0775"
    mkdir -p "$AGENT_DIR"
    chown postgres:postgres "$AGENT_DIR"
    chmod 0775 "$AGENT_DIR"
fi

/usr/local/newrelic-infra/bin/newrelic-infra &> /var/log/newrelic-infra/agent.log &
echo $! > "$AGENT_PID" || {
    log "ERROR: Cannot write to $AGENT_PID"
    exit 1
}
log "New Relic infrastructure agent started (PID: $(cat "$AGENT_PID"))"

# --------------------------------------------------------
# Initialize and start PostgreSQL
# --------------------------------------------------------
# Initialize PostgreSQL if needed
initialize_postgres

# Ensure proper permissions
chown -R postgres:postgres "$PGDATA"
chmod 0700 "$PGDATA"

log "Starting PostgreSQL server..."
pg_ctl -D "$PGDATA" -w start -o "-c config_file=/etc/postgresql/postgresql.conf" || {
    log "ERROR: PostgreSQL start failed"
    exit 1
}

# Wait for PostgreSQL to be ready
local max_attempts=30
local attempt=1
while [ $attempt -le $max_attempts ]; do
    if check_postgres; then
        log "PostgreSQL is accepting connections"
        break
    fi
    log "Waiting for PostgreSQL to start (attempt $attempt/$max_attempts)..."
    sleep 1
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    log "ERROR: PostgreSQL failed to start after $max_attempts attempts"
    exit 1
fi

# Check extensions
if ! check_extensions; then
    log "ERROR: PostgreSQL extension verification failed"
    exit 1
fi

# Verify preload libraries
if ! verify_preload_libraries; then
    log "ERROR: PostgreSQL preload libraries verification failed"
    exit 1
fi

log "Initialization complete, container is ready"
exec "$@"
