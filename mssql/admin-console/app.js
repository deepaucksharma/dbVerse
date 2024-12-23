// admin-console/app.js
process.env.NEW_RELIC_APP_NAME = process.env.NEW_RELIC_APP_NAME || 'Admin-Console';
const newrelic = require('newrelic');
console.log('New Relic agent status:', newrelic.agent.config.agent_enabled);

const express = require('express');
const sql = require('mssql');

const requestLogger = (serviceName) => (req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    console.log(
      `${serviceName} | ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${duration}ms${
        data.error ? ' | Error: ' + data.error : ''
      }`
    );
    return originalJson.apply(this, arguments);
  };
  next();
};

async function startAdminConsole() {
  const config = {
    server: process.env.MSSQL_HOST || 'localhost',
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || 'YourStrong!Passw0rd',
    database: process.env.MSSQL_DB || 'AdventureWorks',
    options: {
      trustServerCertificate: true,
      enableArithAbort: true
    },
    pool: {
      max: 10,
      idleTimeoutMillis: 30000
    }
  };

  try {
    await sql.connect(config);
    console.log('Admin Console connected to MSSQL!');

    const app = express();
    app.use(express.json());
    app.use(requestLogger('Admin-Console'));

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Suboptimal employee search
    app.get('/admin/employees/search', async (req, res) => {
      newrelic.setTransactionName('admin-console-employee-search');
      const transaction = new sql.Transaction();
      try {
        await transaction.begin();

        const result = await transaction.request().query(`
          SELECT TOP 100
            p.BusinessEntityID,
            p.FirstName,
            p.LastName,
            e.JobTitle,
            e.HireDate
          FROM Person.Person p
          JOIN HumanResources.Employee e
            ON p.BusinessEntityID = e.BusinessEntityID
          ORDER BY e.HireDate DESC
        `);

        await transaction.commit();
        res.json({ status: 'ok', data: result.recordset });
      } catch (err) {
        await transaction.rollback();
        newrelic.noticeError(err);
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });

    // Additional routes as needed...
    // e.g. /admin/users/manage, /admin/reports, etc.

    const port = process.env.PORT || 3003;
    app.listen(port, () => {
      console.log(`Admin Console running on port ${port}`);
    });
  } catch (err) {
    newrelic.noticeError(err);
    console.error('Failed to start Admin Console:', err);
    process.exit(1);
  }
}

startAdminConsole().catch(console.error);
