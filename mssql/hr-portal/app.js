// hr-portal/app.js
process.env.NEW_RELIC_APP_NAME = process.env.NEW_RELIC_APP_NAME || 'HR-Portal';
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

async function startHRPortal() {
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
    console.log('HR Portal connected to MSSQL!');

    const app = express();
    app.use(express.json());
    app.use(requestLogger('HR-Portal'));

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Suboptimal employee search
    app.get('/hr/employees/search', async (req, res) => {
      newrelic.setTransactionName('hr-portal-employee-search');
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
          WHERE e.HireDate < '2005-01-01'
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
    // e.g. /hr/employees/search_by_name, /hr/employees/transfer, etc.

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`HR Portal running on port ${port}`);
    });
  } catch (err) {
    newrelic.noticeError(err);
    console.error('Failed to start HR Portal:', err);
    process.exit(1);
  }
}

startHRPortal().catch(console.error);
