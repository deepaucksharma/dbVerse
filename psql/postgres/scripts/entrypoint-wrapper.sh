#!/bin/bash
set -e

# Start New Relic Infrastructure agent in background
if [ -f "/etc/newrelic-infra.yml" ] && [ -n "${NEW_RELIC_LICENSE_KEY}" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting New Relic Infrastructure agent..."
    mkdir -p /var/log/newrelic-infra /var/run/newrelic-infra
    /usr/local/newrelic-infra/bin/newrelic-infra -config /etc/newrelic-infra.yml > /var/log/newrelic-infra/agent.log 2>&1 &
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] New Relic Infrastructure agent started (PID: $!)"
fi

# Call the original PostgreSQL entrypoint
exec docker-entrypoint.sh "$@"