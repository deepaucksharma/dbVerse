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
        max: 10,
        min: 1,
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

// Employee analysis endpoint
app.get('/performance/employee-analysis', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    const { departmentId } = req.query;
    
    try {
        const request = db.getPool().request();
        let query = `
            SELECT 
                e.BusinessEntityID,
                p.FirstName,
                p.LastName,
                e.JobTitle,
                d.Name AS DepartmentName,
                DATEDIFF(YEAR, e.HireDate, GETDATE()) AS YearsEmployed,
                e.SickLeaveHours,
                e.VacationHours,
                eph.Rate AS CurrentRate
            FROM HumanResources.Employee e
            JOIN Person.Person p 
                ON e.BusinessEntityID = p.BusinessEntityID
            LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
                ON e.BusinessEntityID = edh.BusinessEntityID
                AND edh.EndDate IS NULL
            LEFT JOIN HumanResources.Department d
                ON edh.DepartmentID = d.DepartmentID
            LEFT JOIN HumanResources.EmployeePayHistory eph
                ON e.BusinessEntityID = eph.BusinessEntityID
        `;

        if (departmentId) {
            request.input('departmentId', sql.Int, departmentId);
            query += ' WHERE edh.DepartmentID = @departmentId';
        }

        query += ' ORDER BY p.LastName, p.FirstName';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).json({
            error: 'Database operation failed',
            message: err.message
        });
    }
});

// Department metrics endpoint
app.get('/performance/department-metrics', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    try {
        const result = await db.getPool().request().query(`
            SELECT 
                d.DepartmentID,
                d.Name AS DepartmentName,
                COUNT(e.BusinessEntityID) AS EmployeeCount,
                AVG(CAST(e.SickLeaveHours AS FLOAT)) AS AvgSickLeaveHours,
                AVG(CAST(e.VacationHours AS FLOAT)) AS AvgVacationHours,
                AVG(DATEDIFF(YEAR, e.HireDate, GETDATE())) AS AvgYearsEmployed,
                MIN(e.HireDate) AS LongestTenuredHireDate,
                MAX(e.HireDate) AS NewestHireDate
            FROM HumanResources.Department d
            LEFT JOIN HumanResources.EmployeeDepartmentHistory edh
                ON d.DepartmentID = edh.DepartmentID
                AND edh.EndDate IS NULL
            LEFT JOIN HumanResources.Employee e
                ON edh.BusinessEntityID = e.BusinessEntityID
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

const port = process.env.PORT || 3002;
app.listen(port, () => {
    console.log(`Performance Review running on port ${port}`);
});
