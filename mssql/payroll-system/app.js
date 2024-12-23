// payroll-system/app.js
process.env.NEW_RELIC_APP_NAME = process.env.NEW_RELIC_APP_NAME || 'Payroll-System';
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

async function startPayrollSystem() {
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
    console.log('Payroll System connected to MSSQL!');

    const app = express();
    app.use(express.json());
    app.use(requestLogger('Payroll-System'));

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Suboptimal sales commission calculation
    app.get('/payroll/sales/commission', async (req, res) => {
      newrelic.setTransactionName('payroll-system-sales-commission');
      const transaction = new sql.Transaction();
      try {
        await transaction.begin();

        const result = await transaction.request().query(`
          SELECT TOP 100
            soh.SalesOrderID,
            soh.OrderDate,
            SUM(sod.LineTotal) AS TotalSales
          FROM Sales.SalesOrderHeader soh
          JOIN Sales.SalesOrderDetail sod
            ON soh.SalesOrderID = sod.SalesOrderID
          GROUP BY soh.SalesOrderID, soh.OrderDate
          ORDER BY soh.OrderDate DESC
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
    // e.g. /payroll/employees/paychecks, /payroll/taxes, etc.

    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`Payroll System running on port ${port}`);
    });
  } catch (err) {
    newrelic.noticeError(err);
    console.error('Failed to start Payroll System:', err);
    process.exit(1);
  }
}

startPayrollSystem().catch(console.error);
