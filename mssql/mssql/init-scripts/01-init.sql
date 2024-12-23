-- Example T-SQL to create logins or config
USE master;
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = N'new_relic')
BEGIN
    CREATE LOGIN [new_relic] WITH PASSWORD=N'SomeSecurePass1!';
END

USE AdventureWorks;
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = N'new_relic')
BEGIN
    CREATE USER [new_relic] FOR LOGIN [new_relic];
    ALTER ROLE db_datareader ADD MEMBER [new_relic];
END

EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
EXEC sp_configure 'clr enabled', 1;
RECONFIGURE;
GO
