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

// Employee search endpoint
app.get('/hr/employees/search', async (req, res) => {
    if (!db.isReady()) {
        return res.status(503).json({ error: 'Database not ready' });
    }

    const { name, department, page = 1, pageSize = 20 } = req.query;
    
    try {
        const pool = db.getPool();
        const request = pool.request();
        
        let query = `
            SELECT 
                e.BusinessEntityID,
                p.FirstName,
                p.LastName,
                e.JobTitle,
                d.Name AS Department,
                COUNT(*) OVER() as TotalCount
            FROM HumanResources.Employee e
            JOIN Person.Person p ON e.BusinessEntityID = p.BusinessEntityID
            LEFT JOIN HumanResources.EmployeeDepartmentHistory edh 
                ON e.BusinessEntityID = edh.BusinessEntityID 
                AND edh.EndDate IS NULL
            LEFT JOIN HumanResources.Department d 
                ON edh.DepartmentID = d.DepartmentID
            WHERE 1=1
        `;

        if (name) {
            request.input('name', sql.NVarChar, `%${name}%`);
            query += ` AND (p.FirstName LIKE @name OR p.LastName LIKE @name)`;
        }

        if (department) {
            request.input('department', sql.NVarChar, `%${department}%`);
            query += ` AND d.Name LIKE @department`;
        }

        query += `
            ORDER BY p.LastName, p.FirstName
            OFFSET @offset ROWS
            FETCH NEXT @pageSize ROWS ONLY
        `;

        request.input('offset', sql.Int, (page - 1) * pageSize);
        request.input('pageSize', sql.Int, pageSize);

        const result = await request.query(query);

        const totalCount = result.recordset[0]?.TotalCount || 0;
        const totalPages = Math.ceil(totalCount / pageSize);

        res.json({
            employees: result.recordset,
            pagination: {
                currentPage: page,
                pageSize,
                totalPages,
                totalCount
            }
        });
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).json({
            error: 'Database operation failed',
            message: err.message
        });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`HR Portal running on port ${port}`);
});
