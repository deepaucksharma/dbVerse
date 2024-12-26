FROM mcr.microsoft.com/mssql/server:2019-latest

USER root

# Add Microsoft repository and install tools
RUN apt-get update && \
    apt-get install -y wget curl gnupg2 && \
    curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - && \
    curl https://packages.microsoft.com/config/ubuntu/20.04/prod.list > /etc/apt/sources.list.d/msprod.list && \
    apt-get update && \
    ACCEPT_EULA=Y apt-get install -y mssql-tools unixodbc-dev && \
    rm -rf /var/lib/apt/lists/*

# Add SQL Tools to path
ENV PATH="${PATH}:/opt/mssql-tools/bin"

WORKDIR /var/opt/mssql

# Create directories with correct ownership
RUN mkdir -p /var/opt/mssql/backup && \
    mkdir -p /var/opt/mssql/init-scripts && \
    mkdir -p /var/opt/mssql/scripts && \
    chown -R 10001:0 /var/opt/mssql

# Copy scripts
COPY scripts/start.sh /var/opt/mssql/scripts/
RUN chmod +x /var/opt/mssql/scripts/start.sh && \
    chown 10001:0 /var/opt/mssql/scripts/start.sh

USER 10001

EXPOSE 1433

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P $SA_PASSWORD -Q "SELECT name FROM sys.databases WHERE name = 'AdventureWorks' AND state_desc = 'ONLINE'" || exit 1

CMD ["/var/opt/mssql/scripts/start.sh"]