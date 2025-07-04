# ------------------------------------------------------------------------
# Stage 1: Build the nri-mysql integration (using Go)
# ------------------------------------------------------------------------
FROM golang:1.23-bullseye AS builder-go

WORKDIR /build

# Install Git + Make + CA certs
RUN apt-get update && \
    apt-get install -y --no-install-recommends git make ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Clone and build nri-mysql with retry logic - using a stable release
RUN git clone --depth=1 --branch v1.10.7 \
    https://github.com/newrelic/nri-mysql.git . && \
    go env -w GOPROXY=direct && \
    go env -w GOSUMDB=off && \
    for i in 1 2 3 4 5; do \
      echo "Attempt $i: downloading Go dependencies..."; \
      go mod download && break || sleep 5; \
    done && \
    go mod verify && \
    make

# ------------------------------------------------------------------------
# Stage 2: Final MySQL Image with New Relic
# ------------------------------------------------------------------------
FROM mysql:8.0

# Build args
ARG NEW_RELIC_LICENSE_KEY
ARG NR_INFRA_VERSION=1.58.1

# Environment variables
ENV MYSQL_ROOT_PASSWORD=pass \
    MYSQL_DATABASE=employees \
    PATH="/usr/local/newrelic-infra/bin:${PATH}"

USER root

# Install system dependencies
RUN microdnf update && \
    microdnf install -y \
        curl \
        ca-certificates \
        procps \
        jq \
        tar \
        gzip \
    && microdnf clean all

# Copy the built nri-mysql integration from builder stage
COPY --from=builder-go /build/bin/nri-mysql /var/db/newrelic-infra/newrelic-integrations/
RUN chmod 755 /var/db/newrelic-infra/newrelic-integrations/nri-mysql

# Create directories and download New Relic Infrastructure agent
RUN mkdir -p /usr/local/newrelic-infra/bin /etc/newrelic-infra/integrations.d && \
    chmod -R 777 /usr/local/newrelic-infra /etc/newrelic-infra && \
    cd /tmp && \
    AGENT_URL="https://download.newrelic.com/infrastructure_agent/binaries/linux/amd64/newrelic-infra_linux_${NR_INFRA_VERSION}_amd64.tar.gz" && \
    echo "Downloading New Relic Infrastructure agent version ${NR_INFRA_VERSION}..." && \
    curl -fsSL --retry 3 "${AGENT_URL}" -o newrelic-infra.tar.gz && \
    tar -xzf newrelic-infra.tar.gz && \
    cp newrelic-infra/usr/bin/newrelic-infra /usr/local/newrelic-infra/bin/ && \
    chmod +x /usr/local/newrelic-infra/bin/newrelic-infra && \
    rm -rf /tmp/*

# Configure New Relic
RUN if [ -n "${NEW_RELIC_LICENSE_KEY}" ]; then \
        echo "license_key: ${NEW_RELIC_LICENSE_KEY}" > /etc/newrelic-infra.yml && \
        echo "enable_process_metrics: true" >> /etc/newrelic-infra.yml && \
        echo "log_level: info" >> /etc/newrelic-infra.yml && \
        chmod 640 /etc/newrelic-infra.yml; \
    else \
        echo "WARNING: NEW_RELIC_LICENSE_KEY not provided"; \
    fi

# Copy MySQL configuration
COPY config/my.cnf /etc/mysql/conf.d/
COPY config/newrelic-mysql-integration.yml /etc/newrelic-infra/integrations.d/mysql-config.yml

# Copy init scripts
COPY init-scripts/*.sql /docker-entrypoint-initdb.d/

# Set proper permissions
RUN chmod 644 /docker-entrypoint-initdb.d/*.sql 2>/dev/null || true

# Copy startup script
COPY scripts/startup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/startup.sh

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD mysqladmin ping -h localhost -u root -p${MYSQL_ROOT_PASSWORD} || exit 1

EXPOSE 3306

# Use custom entrypoint that starts both MySQL and New Relic
ENTRYPOINT ["/usr/local/bin/startup.sh"]