# ------------------------------------------------------------------------
# Stage 1: Build the nri-postgresql integration (using Go 1.21)
# ------------------------------------------------------------------------
FROM golang:1.23-bullseye AS builder-go

WORKDIR /build

# Install Git + Make + CA certs, then clone & build
RUN apt-get update && \
    apt-get install -y --no-install-recommends git make ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Clone and build nri-postgresql with retry logic
RUN git clone --depth=1 --branch queryAnalysisTestingV8 \
    https://github.com/sjyothi54/nri-postgresql.git . && \
    go env -w GOPROXY=direct && \
    go env -w GOSUMDB=off && \
    for i in 1 2 3 4 5; do \
      echo "Attempt $i: downloading Go dependencies..."; \
      go mod download && break || sleep 5; \
    done && \
    go mod verify && \
    make

# ------------------------------------------------------------------------
# Stage 2: Build pg_stat_monitor + pg_wait_sampling (pinned versions)
# ------------------------------------------------------------------------
    FROM postgres:15-bullseye AS extensions-builder

    RUN apt-get update && \
        apt-get install -y --no-install-recommends \
            build-essential \
            git \
            ca-certificates \
            postgresql-server-dev-15 && \
        update-ca-certificates
    
    # Build pg_stat_monitor (version 2.1.0)
    RUN cd /tmp && \
        for i in 1 2 3 4 5; do \
            echo "Attempt $i: cloning pg_stat_monitor..."; \
            git clone --depth=1 -b 2.1.0 https://github.com/percona/pg_stat_monitor.git && \
            break || sleep 5; \
        done && \
        cd pg_stat_monitor && \
        make USE_PGXS=1 && \
        make USE_PGXS=1 install
    
    # Build pg_wait_sampling (version 1.1.6)
    RUN cd /tmp && \
        for i in 1 2 3 4 5; do \
            echo "Attempt $i: cloning pg_wait_sampling..."; \
            git clone --depth=1 -b v1.1.6 https://github.com/postgrespro/pg_wait_sampling.git && \
            break || sleep 5; \
        done && \
        cd pg_wait_sampling && \
        make USE_PGXS=1 && \
        make USE_PGXS=1 install

# ------------------------------------------------------------------------
# Stage 3: Process initialization data
# ------------------------------------------------------------------------
FROM postgres:15-bullseye AS init-processor

WORKDIR /tmp/init

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        bzip2 \
        postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy init scripts directory
COPY init-scripts/ ./

# Handle employees data file if it exists
RUN if [ -f employees_data.sql.bz2 ]; then \
        echo "Found compressed employees data file"; \
        bunzip2 employees_data.sql.bz2; \
    elif [ -f employees_data.sql ]; then \
        echo "Found uncompressed employees data file"; \
    else \
        echo "No employees data file found"; \
    fi

# ------------------------------------------------------------------------
# Stage 4: Final Image
# ------------------------------------------------------------------------
FROM postgres:15-bullseye

# Build args
ARG NEW_RELIC_LICENSE_KEY
ARG NR_POSTGRES_PASSWORD
ARG NR_INFRA_VERSION=1.58.1

# Environment variables
ENV POSTGRES_USER=postgres \
    POSTGRES_PASSWORD=postgres \
    POSTGRES_DB=employees \
    PATH="/usr/local/newrelic-infra/bin:${PATH}" \
    PGDATA="/var/lib/postgresql/data"

USER root

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        bzip2 \
        procps \
        postgresql-contrib \
        jq \
    && rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

# Copy the built extension libs from the builder stages
COPY --from=extensions-builder /usr/lib/postgresql/15/lib/pg_stat_monitor.so /usr/lib/postgresql/15/lib/
COPY --from=extensions-builder /usr/share/postgresql/15/extension/pg_stat_monitor* /usr/share/postgresql/15/extension/
COPY --from=extensions-builder /usr/lib/postgresql/15/lib/pg_wait_sampling.so /usr/lib/postgresql/15/lib/
COPY --from=extensions-builder /usr/share/postgresql/15/extension/pg_wait_sampling* /usr/share/postgresql/15/extension/

# Create directory with liberal permissions
USER root
RUN mkdir -p /tmp/pgdata && \
    chmod 777 /tmp/pgdata && \
    chmod -R 777 /docker-entrypoint-initdb.d && \
    chmod -R 777 /etc/postgresql


# Copy and set up the nri-postgresql integration
COPY --from=builder-go /build/bin/nri-postgresql /var/db/newrelic-infra/newrelic-integrations/
RUN chmod 755 /var/db/newrelic-infra/newrelic-integrations/nri-postgresql

# In the final stage, before downloading New Relic agent:
    RUN mkdir -p /usr/local/newrelic-infra/bin /tmp/pgdata /etc/newrelic-infra && \
    chmod -R 777 /usr/local/newrelic-infra /tmp/pgdata /etc/newrelic-infra && \
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

# Copy configuration files
COPY config/postgresql.conf /etc/postgresql/
COPY config/pg_hba.conf /etc/postgresql/
COPY config/newrelic-postgres-integration.yml /etc/newrelic-infra/integrations.d/postgresql-config.yml

# Copy initialization scripts in order
COPY init-scripts/00-configure-memory.sh /docker-entrypoint-initdb.d/
COPY init-scripts/00-initdb.sql /docker-entrypoint-initdb.d/
COPY init-scripts/01-verify-init.sh /docker-entrypoint-initdb.d/
COPY init-scripts/02-setup-db.sh /docker-entrypoint-initdb.d/
COPY init-scripts/99-post-init.sh /docker-entrypoint-initdb.d/

# Copy data file from init-processor stage if it exists
COPY --from=init-processor /tmp/init/employees_data.sql /docker-entrypoint-initdb.d/

# Copy verification scripts
COPY scripts/verify-extensions.sh /usr/local/bin/

# Set proper permissions
RUN chmod 644 /docker-entrypoint-initdb.d/*.sql 2>/dev/null || true && \
    chmod +x /docker-entrypoint-initdb.d/*.sh /usr/local/bin/*.sh 2>/dev/null || true && \
    chown -R postgres:postgres /docker-entrypoint-initdb.d /usr/local/bin/verify-extensions.sh

# Create status directory for health checks
RUN mkdir -p /var/lib/postgresql/status && \
    chown postgres:postgres /var/lib/postgresql/status

# Switch back to postgres user
USER postgres

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD pg_isready -U postgres -h localhost || exit 1

EXPOSE 5432

# Use the official postgres entrypoint
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
