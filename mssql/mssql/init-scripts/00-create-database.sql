-- Only create database if not restored from backup
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'AdventureWorks')
BEGIN
    CREATE DATABASE AdventureWorks;
END
GO

USE AdventureWorks;
GO

-- Enable snapshot isolation for better concurrency
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'AdventureWorks')
BEGIN
    ALTER DATABASE AdventureWorks SET READ_COMMITTED_SNAPSHOT ON;
END
GO

-- Enable query store for performance monitoring
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'AdventureWorks')
BEGIN
    ALTER DATABASE AdventureWorks SET QUERY_STORE = ON
    (
        OPERATION_MODE = READ_WRITE,
        CLEANUP_POLICY = (STALE_QUERY_THRESHOLD_DAYS = 30),
        DATA_FLUSH_INTERVAL_SECONDS = 900,
        MAX_STORAGE_SIZE_MB = 1000,
        INTERVAL_LENGTH_MINUTES = 60
    );
END
GO