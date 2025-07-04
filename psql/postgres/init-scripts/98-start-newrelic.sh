#!/bin/bash
# Start New Relic Infrastructure agent after PostgreSQL is ready

if [ -n "${NEW_RELIC_LICENSE_KEY}" ] && [ -f "/usr/local/newrelic-infra/bin/newrelic-infra" ]; then
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting New Relic Infrastructure agent..."
    
    # Create necessary directories
    mkdir -p /var/log/newrelic-infra /var/run/newrelic-infra 2>/dev/null || true
    
    # Start the agent in background
    nohup /usr/local/newrelic-infra/bin/newrelic-infra > /var/log/newrelic-infra/agent.log 2>&1 &
    
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] New Relic Infrastructure agent started (PID: $!)"
else
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] New Relic Infrastructure agent not started (no license key or binary not found)"
fi