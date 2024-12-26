import 'newrelic';
import express from 'express';
import DatabaseConnection from '../shared/db-connection.js';

const dbConfig = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_HOST,
    database: process.env.MSSQL_DB,
    port: parseInt(process.env.MSSQL_PORT),
    options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: parseInt(process.env.MSSQL_REQUEST_TIMEOUT)
    },
    pool: {
        max: parseInt(10),
        min: parseInt(1),
        idleTimeoutMillis: parseInt(30000)
    }
};

const app = express();
app.use(express.json());

const db = new DatabaseConnection(dbConfig);
db.connect().catch(err => {
    console.error('Failed to initialize database connection:', err);
    process.exit(1);
});

// Health check endpoint
app.get('/health', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ 
            status: 'unavailable', 
            dbConnected: false 
        });
    }
    try {
        await db.getPool().request().query('SELECT 1');
        res.json({ 
            status: 'ok', 
            dbConnected: true,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({ 
            status: 'unavailable', 
            dbConnected: false 
        });
    }
});

// Organization hierarchy endpoint
app.get('/admin/org-hierarchy', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    try {
        const result = await db.getPool().request()
            .query(`
                WITH DepartmentStats AS (
                    SELECT 
                        d.DepartmentID,
                        d.Name AS DepartmentName,
                        COUNT(e.BusinessEntityID) AS EmployeeCount,
                        SUM(eph.Rate * 2080) AS AnnualLabourCost,
                        AVG(eph.Rate) AS AverageSalary,
                        MIN(eph.Rate) AS MinSalary,
                        MAX(eph.Rate) AS MaxSalary,
                        AVG(CAST(e.SickLeaveHours AS FLOAT)) AS AvgSickLeave,
                        AVG(CAST(e.VacationHours AS FLOAT)) AS AvgVacation
                    FROM HumanResources.Department d
                    LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
                        ON d.DepartmentID = edh.DepartmentID
                        AND edh.EndDate IS NULL
                    LEFT JOIN HumanResources.Employee e
                        ON edh.BusinessEntityID = e.BusinessEntityID
                    LEFT JOIN HumanResources.EmployeePayHistory eph
                        ON e.BusinessEntityID = eph.BusinessEntityID
                    GROUP BY d.DepartmentID, d.Name
                )
                SELECT 
                    ds.*,
                    ROUND(ds.AnnualLabourCost / NULLIF(ds.EmployeeCount, 0), 2) AS CostPerEmployee,
                    ROUND((ds.MaxSalary - ds.MinSalary) / NULLIF(ds.MinSalary, 0) * 100, 2) AS SalarySpreadPercent,
                    ROUND(ds.AvgSickLeave, 1) AS AverageSickLeaveHours,
                    ROUND(ds.AvgVacation, 1) AS AverageVacationHours
                FROM DepartmentStats ds
                ORDER BY ds.EmployeeCount DESC;
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).json({
            error: 'Database operation failed',
            message: err.message
        });
    }
});

// Bulk department transfer endpoint
app.post('/admin/bulk-department-transfer', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    const { sourceDeptId, targetDeptId } = req.body;

    // Validation
    if (!sourceDeptId || !targetDeptId) {
        return res.status(400).json({
            error: 'Invalid input',
            message: 'sourceDeptId and targetDeptId are required'
        });
    }

    if (sourceDeptId === targetDeptId) {
        return res.status(400).json({
            error: 'Invalid input',
            message: 'Source and target departments must be different'
        });
    }

    try {
        const result = await db.getPool().request()
            .input('sourceDeptId', sql.Int, sourceDeptId)
            .input('targetDeptId', sql.Int, targetDeptId)
            .query(`
                BEGIN TRY
                    BEGIN TRANSACTION;
                    
                    DECLARE @CurrentDate datetime = GETDATE();
                    DECLARE @AffectedCount INT = 0;
                    
                    -- Verify departments exist
                    IF NOT EXISTS (
                        SELECT 1 
                        FROM HumanResources.Department
                        WHERE DepartmentID IN (@sourceDeptId, @targetDeptId)
                        HAVING COUNT(*) = 2
                    )
                    BEGIN
                        THROW 50001, 'One or both departments not found', 1;
                    END

                    -- End current department assignments
                    UPDATE HumanResources.EmployeeDepartmentHistory
                    SET EndDate = @CurrentDate
                    WHERE DepartmentID = @sourceDeptId
                        AND EndDate IS NULL;
                    
                    SET @AffectedCount = @@ROWCOUNT;

                    IF @AffectedCount = 0
                    BEGIN
                        THROW 50002, 'No employees found in source department', 1;
                    END
                    
                    -- Create new department assignments
                    INSERT INTO HumanResources.EmployeeDepartmentHistory (
                        BusinessEntityID,
                        DepartmentID,
                        ShiftID,
                        StartDate,
                        ModifiedDate
                    )
                    SELECT 
                        BusinessEntityID,
                        @targetDeptId,
                        ShiftID,
                        @CurrentDate,
                        @CurrentDate
                    FROM HumanResources.EmployeeDepartmentHistory
                    WHERE DepartmentID = @sourceDeptId
                        AND EndDate = @CurrentDate;
                    
                    COMMIT TRANSACTION;
                    
                    SELECT @AffectedCount AS TransferredEmployees;
                END TRY
                BEGIN CATCH
                    IF @@TRANCOUNT > 0 
                        ROLLBACK TRANSACTION;
                    
                    THROW;
                END CATCH;
            `);

        res.json({
            status: 'success',
            message: 'Successfully transferred ' + result.recordset[0].TransferredEmployees + ' employees',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).json({
            error: 'Database operation failed',
            message: err.message
        });
    }
});

const port = process.env.PORT || 3003;
app.listen(port, () => {
    console.log('Admin Console running on port ' + port);
});
