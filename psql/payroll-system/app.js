const express = require('express');
const { Pool } = require('pg');

const requestLogger = (serviceName) => (req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    console.log(
      `${serviceName} | ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${duration}ms${
        data.error ? ` | Error: ${data.error}` : ''
      }`
    );
    return originalJson.apply(this, arguments);
  };
  next();
};

async function startPayrollSystem() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'pass',
    database: process.env.POSTGRES_DB || 'employees',
    max: 10,
    idleTimeoutMillis: 30000
  });

  pool.on('error', (err) => {
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
  app.use(requestLogger('Payroll-System'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/payroll/employees', async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT e.id, e.first_name, e.last_name, s.amount, d.dept_name
        FROM employee e
        JOIN salary s ON e.id = s.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        WHERE s.to_date = '9999-01-01' AND de.to_date = '9999-01-01'
      `);
      await client.query('COMMIT');
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  app.get('/payroll/salaries/:employeeId', async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT s.amount
        FROM salary s
        WHERE s.employee_id = $1 AND s.to_date = '9999-01-01'
      `, [req.params.employeeId]);
      await client.query('COMMIT');
      if (rows.length > 0) {
        res.json({ status: 'ok', salary: rows[0].amount });
      } else {
        res.status(404).json({ error: 'Salary not found' });
      }
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    console.log(`Payroll System listening on port ${port}`);
  });
}

startPayrollSystem();
