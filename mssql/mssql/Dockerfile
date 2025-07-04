# ------------------------------------------------------------------------
# Final Image (without custom build - use pre-built integration)
# ------------------------------------------------------------------------
FROM mcr.microsoft.com/mssql/server:2019-latest

# Build args
ARG NEW_RELIC_LICENSE_KEY
ARG NR_INFRA_VERSION=1.58.1

# Environment variables
ENV PATH="/usr/local/newrelic-infra/bin:/opt/mssql-tools/bin:${PATH}" \
    ACCEPT_EULA=Y

USER root

# Add Microsoft repository and install tools
RUN apt-get update && \
    apt-get install -y wget curl gnupg2 ca-certificates procps jq && \
    curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - && \
    curl https://packages.microsoft.com/config/ubuntu/20.04/prod.list > /etc/apt/sources.list.d/msprod.list && \
    apt-get update && \
    ACCEPT_EULA=Y apt-get install -y mssql-tools unixodbc-dev && \
    rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

# Create directories for New Relic (integration will be installed via infrastructure agent)
RUN mkdir -p /var/db/newrelic-infra/newrelic-integrations /etc/newrelic-infra/integrations.d

# Install New Relic Infrastructure agent
RUN mkdir -p /usr/local/newrelic-infra/bin /etc/newrelic-infra && \
    chmod -R 777 /usr/local/newrelic-infra /etc/newrelic-infra && \
    cd /tmp && \
    AGENT_URL="https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/newrelic-infra_linux_${NR_INFRA_VERSION}_amd64.tar.gz" && \
    echo "Downloading New Relic Infrastructure agent version ${NR_INFRA_VERSION}..." && \
    curl -fsSL --retry 3 "${AGENT_URL}" -o newrelic-infra.tar.gz && \
    tar -xzf newrelic-infra.tar.gz && \
    cp newrelic-infra/usr/bin/newrelic-infra /usr/local/newrelic-infra/bin/ && \
    chmod +x /usr/local/newrelic-infra/bin/newrelic-infra && \
    rm -rf /tmp/*

# Configure New Relic with secure handling of license key
RUN if [ -n "${NEW_RELIC_LICENSE_KEY}" ]; then \
        echo "license_key: ${NEW_RELIC_LICENSE_KEY}" > /etc/newrelic-infra.yml && \
        echo "enable_process_metrics: true" >> /etc/newrelic-infra.yml && \
        chmod 640 /etc/newrelic-infra.yml; \
    else \
        echo "WARNING: NEW_RELIC_LICENSE_KEY not provided"; \
    fi

WORKDIR /var/opt/mssql

# Create directories with correct ownership
RUN mkdir -p /var/opt/mssql/backup && \
    mkdir -p /var/opt/mssql/init-scripts && \
    mkdir -p /var/opt/mssql/scripts && \
    mkdir -p /var/opt/mssql/status && \
    mkdir -p /etc/newrelic-infra/integrations.d && \
    chown -R 10001:0 /var/opt/mssql && \
    chmod 777 /var/opt/mssql/status

# Copy configuration files
COPY config/newrelic-mssql-integration.yml /etc/newrelic-infra/integrations.d/mssql-config.yml

# Copy scripts
COPY scripts/start.sh /var/opt/mssql/scripts/
RUN chmod +x /var/opt/mssql/scripts/start.sh && \
    chown 10001:0 /var/opt/mssql/scripts/start.sh && \
    chmod 644 /etc/newrelic-infra/integrations.d/mssql-config.yml

USER 10001

EXPOSE 1433

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P $SA_PASSWORD -Q "SELECT name FROM sys.databases WHERE name = 'AdventureWorks' AND state_desc = 'ONLINE'" || exit 1

CMD ["/var/opt/mssql/scripts/start.sh"]