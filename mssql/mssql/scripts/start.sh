#!/bin/bash
set -e

# Start SQL Server
/opt/mssql/bin/sqlservr &
SQLSERVER_PID=$!

# Function to check if SQL Server is ready
check_sql() {
    /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -Q "SELECT 1" &> /dev/null
}

# Wait for SQL Server to start
echo "Waiting for SQL Server to start..."
until check_sql; do
    sleep 1
done

echo "SQL Server started"

# Run initialization scripts in order
for script in /var/opt/mssql/init-scripts/*.sql
do
    if [ -f "$script" ]
    then
        echo "Running $script"
        /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -i "$script"
    fi
done

# Handle database restore
if [ -f /var/opt/mssql/backup/AdventureWorks2019.bak ]
then
    echo "Getting backup file information..."
    # Get logical file names from backup
    LOGICALNAMES=$(/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -Q "RESTORE FILELISTONLY FROM DISK = '/var/opt/mssql/backup/AdventureWorks2019.bak'" | tr -s ' ' | cut -d ' ' -f 1-2)
    
    # Parse logical names
    DATANAME=$(echo "$LOGICALNAMES" | grep "\.mdf" | cut -d ' ' -f 1)
    LOGNAME=$(echo "$LOGICALNAMES" | grep "\.ldf" | cut -d ' ' -f 1)
    
    if [ -z "$DATANAME" ] || [ -z "$LOGNAME" ]; then
        echo "Error: Could not determine logical file names from backup"
        exit 1
    fi
    
    echo "Found logical files: Data=$DATANAME, Log=$LOGNAME"
    
    echo "Dropping existing AdventureWorks database if it exists..."
    /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -Q "IF DB_ID('AdventureWorks') IS NOT NULL BEGIN ALTER DATABASE AdventureWorks SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE AdventureWorks; END"
    
    echo "Restoring AdventureWorks database..."
    /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -Q "RESTORE DATABASE AdventureWorks FROM DISK = '/var/opt/mssql/backup/AdventureWorks2019.bak' WITH MOVE '$DATANAME' TO '/var/opt/mssql/data/AdventureWorks.mdf', MOVE '$LOGNAME' TO '/var/opt/mssql/data/AdventureWorks_log.ldf', REPLACE"
    
    # Wait for restore to complete and verify database is online
    echo "Verifying database restore..."
    for i in {1..30}; do
        STATUS=$(/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -Q "SELECT state_desc FROM sys.databases WHERE name = 'AdventureWorks'" -h-1)
        if [ "$STATUS" = "ONLINE" ]; then
            echo "Database AdventureWorks is online"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "Timeout waiting for database to come online"
            exit 1
        fi
        sleep 1
    done
else
    echo "No backup file found at /var/opt/mssql/backup/AdventureWorks2019.bak"
fi

# Configure database
echo "Configuring database settings..."
/opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -d "AdventureWorks" -Q "
ALTER DATABASE AdventureWorks SET READ_COMMITTED_SNAPSHOT ON;
ALTER DATABASE AdventureWorks SET QUERY_STORE = ON;
"

# Wait for SQL Server process
wait $SQLSERVER_PID