import 'newrelic';
import express from 'express';
import sql from 'mssql';
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

// Department costs endpoint
app.get('/payroll/department-costs', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    try {
        const result = await db.getPool().request().query(`
            SELECT 
                d.DepartmentID,
                d.Name AS DepartmentName,
                COUNT(e.BusinessEntityID) AS EmployeeCount,
                SUM(eph.Rate * 2080) AS AnnualPayroll,
                AVG(eph.Rate * 2080) AS AverageAnnualSalary,
                MIN(eph.Rate * 2080) AS MinAnnualSalary,
                MAX(eph.Rate * 2080) AS MaxAnnualSalary
            FROM HumanResources.Department d
            LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
                ON d.DepartmentID = edh.DepartmentID
                AND edh.EndDate IS NULL
            LEFT JOIN HumanResources.Employee e
                ON edh.BusinessEntityID = e.BusinessEntityID
            LEFT JOIN HumanResources.EmployeePayHistory eph
                ON e.BusinessEntityID = eph.BusinessEntityID
            GROUP BY d.DepartmentID, d.Name
            ORDER BY d.Name;
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

// Bulk adjustment endpoint
app.post('/payroll/bulk-adjustment', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    const { departmentId, adjustmentPercent } = req.body;

    if (!departmentId || adjustmentPercent === undefined) {
        return res.status(400).json({
            error: 'Invalid input',
            message: 'departmentId and adjustmentPercent are required'
        });
    }

    try {
        const pool = db.getPool();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        try {
            const request = new sql.Request(transaction);
            
            // Get current employee rates for the department
            const employees = await request
                .input('departmentId', sql.Int, departmentId)
                .query(`
                    SELECT 
                        e.BusinessEntityID,
                        eph.Rate
                    FROM HumanResources.Employee e
                    JOIN HumanResources.EmployeeDepartmentHistory edh
                        ON e.BusinessEntityID = edh.BusinessEntityID
                        AND edh.EndDate IS NULL
                    JOIN HumanResources.EmployeePayHistory eph
                        ON e.BusinessEntityID = eph.BusinessEntityID
                    WHERE edh.DepartmentID = @departmentId;
                `);

            if (employees.recordset.length === 0) {
                throw new Error('No employees found in the specified department');
            }

            // Update rates for each employee
            for (const emp of employees.recordset) {
                const newRate = emp.Rate * (1 + (adjustmentPercent / 100));
                
                await request
                    .input('businessEntityId', sql.Int, emp.BusinessEntityID)
                    .input('newRate', sql.Money, newRate)
                    .input('modifiedDate', sql.DateTime, new Date())
                    .query(`
                        INSERT INTO HumanResources.EmployeePayHistory (
                            BusinessEntityID,
                            RateChangeDate,
                            Rate,
                            PayFrequency,
                            ModifiedDate
                        )
                        VALUES (
                            @businessEntityId,
                            GETDATE(),
                            @newRate,
                            1,
                            @modifiedDate
                        );
                    `);
            }

            await transaction.commit();

            res.json({
                status: 'success',
                message: `Successfully adjusted salaries for ${employees.recordset.length} employees`,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Database operation error:', err);
        res.status(500).json({
            error: 'Database operation failed',
            message: err.message
        });
    }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`Payroll System running on port ${port}`);
});
