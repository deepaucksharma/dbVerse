-- Create a health check procedure
CREATE OR ALTER PROCEDURE [dbo].[sp_HealthCheck]
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @status TABLE (
        Component VARCHAR(50),
        Status VARCHAR(50)
    );

    -- Check database status
    INSERT INTO @status
    SELECT 
        'Database' as Component,
        state_desc as Status
    FROM sys.databases
    WHERE name = 'AdventureWorks';

    -- Check connection count
    INSERT INTO @status
    SELECT 
        'Connections' as Component,
        CAST(COUNT(*) as VARCHAR(50)) as Status
    FROM sys.dm_exec_connections;

    -- Return results
    SELECT * FROM @status;
END;
GO