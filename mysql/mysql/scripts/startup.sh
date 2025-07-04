#!/bin/bash
set -e

# Function to start New Relic Infrastructure agent
start_newrelic() {
    if [ -f "/etc/newrelic-infra.yml" ]; then
        echo "Starting New Relic Infrastructure agent..."
        /usr/local/newrelic-infra/bin/newrelic-infra &
        echo "New Relic Infrastructure agent started with PID $!"
    else
        echo "New Relic configuration not found, skipping agent start"
    fi
}

# Start New Relic in background
start_newrelic

# Execute the original MySQL entrypoint directly
exec /usr/local/bin/docker-entrypoint.sh mysqld