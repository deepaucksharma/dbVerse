// performance-review/app.js
process.env.NEW_RELIC_APP_NAME = process.env.NEW_RELIC_APP_NAME || 'Performance-Review';
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

async function startPerformanceReview() {
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
    console.log('Performance Review connected to MSSQL!');

    const app = express();
    app.use(express.json());
    app.use(requestLogger('Performance-Review'));

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Suboptimal employee performance list
    app.get('/perf/employees/list', async (req, res) => {
      newrelic.setTransactionName('performance-review-employee-list');
      const transaction = new sql.Transaction();
      try {
        await transaction.begin();

        const result = await transaction.request().query(`
          SELECT TOP 100
            e.BusinessEntityID,
            p.FirstName,
            p.LastName,
            e.JobTitle,
            e.HireDate
          FROM HumanResources.Employee e
          JOIN Person.Person p
            ON e.BusinessEntityID = p.BusinessEntityID
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
    // e.g. /perf/reviews/submit, /perf/reviews/search, etc.

    const port = process.env.PORT || 3002;
    app.listen(port, () => {
      console.log(`Performance Review running on port ${port}`);
    });
  } catch (err) {
    newrelic.noticeError(err);
    console.error('Failed to start Performance Review:', err);
    process.exit(1);
  }
}

startPerformanceReview().catch(console.error);
