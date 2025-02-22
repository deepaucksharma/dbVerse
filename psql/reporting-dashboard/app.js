// const newrelic = require('newrelic');

const express = require('express');
const { Pool } = require('pg');

const requestLogger = (serviceName) => (req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    // newrelic.addCustomAttribute('responseTime', duration);
    console.log(
      `${serviceName} | ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${duration}ms${
        data.error ? ` | Error: ${data.error}` : ''
      }`
    );
    return originalJson.apply(this, arguments);
  };
  next();
};

async function startReportingDashboard() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'pass',
    database: process.env.POSTGRES_DB || 'employees',
    max: 10,
    idleTimeoutMillis: 30000
  });

  pool.on('error', (err) => {
    // newrelic.noticeError(err);
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  pool.on('connect', async (client) => {
    try {
      await client.query('SET search_path TO employees, public');
    } catch (err) {
      client.release();
      throw err;
    }
  });

  const app = express();
  app.use(express.json());
  app.use(requestLogger('Reporting-Dashboard'));

  app.get('/health', (req, res) => {
    // newrelic.setTransactionName('System/HealthCheck');
    res.json({ status: 'ok' });
  });

  app.get('/reporting/employee_counts', async (req, res) => {
    // newrelic.setTransactionName('Reporting/EmployeeCounts');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT d.dept_name, COUNT(de.employee_id) as employee_count
        FROM department d
        JOIN department_employee de ON d.id = de.department_id
        WHERE de.to_date = '9999-01-01'
        GROUP BY d.dept_name
      `);
      await client.query('COMMIT');
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      // newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  const port = process.env.PORT || 3002;
  app.listen(port, () => {
    console.log(`Reporting Dashboard listening on port ${port}`);
  });
}

startReportingDashboard();
