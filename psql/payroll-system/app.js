// payroll-system/app.js
const newrelic = require('newrelic');
console.log('New Relic agent status:', newrelic.agent.config.agent_enabled);

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

  // 1. Basic salary retrieval
  app.get('/payroll/salaries/by_employee', async (req, res) => {
    newrelic.setTransactionName('payroll-system-salary-by-employee');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(
        `
        SELECT 
          e.id,
          e.first_name,
          e.last_name,
          e.birth_date,
          e.gender,
          e.hire_date,
          s.amount as salary,
          s.from_date,
          s.to_date,
          d.dept_name,
          t.title
        FROM employee e
        JOIN salary s ON e.id = s.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        JOIN title t ON e.id = t.employee_id
        WHERE e.id = $1
          AND s.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
      `,
        [10001]
      );
      await client.query('COMMIT');
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  // 2. Salary range search
  app.get('/payroll/salaries/by_range', async (req, res) => {
    newrelic.setTransactionName('payroll-system-salary-by-range');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT 
          e.id,
          e.first_name,
          e.last_name,
          e.birth_date,
          e.gender,
          e.hire_date,
          s.amount as salary,
          d.dept_name
        FROM employee e
        JOIN salary s ON e.id = s.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        WHERE s.amount BETWEEN 50000 AND 70000
          AND s.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
        ORDER BY s.amount DESC
      `);
      await client.query('COMMIT');
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  // 3. Salary adjustment (simulate slow)
  app.put('/payroll/salaries/adjust', async (req, res) => {
    newrelic.setTransactionName('payroll-system-salary-adjust');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE salary s
        SET to_date = CURRENT_DATE
        FROM department_employee de
        WHERE s.employee_id = de.employee_id
          AND de.department_id = 'd005'
          AND s.to_date = '9999-01-01'
      `);

      await client.query(`
        INSERT INTO salary (employee_id, amount, from_date, to_date)
        SELECT s.employee_id, 
               (s.amount * 1.1)::bigint, 
               CURRENT_DATE, 
               '9999-01-01'
        FROM salary s
        JOIN department_employee de ON s.employee_id = de.employee_id
        WHERE de.department_id = 'd005'
          AND s.to_date = CURRENT_DATE
      `);

      // Simulate slow operation
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await client.query('COMMIT');
      res.json({ status: 'ok' });
    } catch (err) {
      newrelic.noticeError(err);
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 4. High connection load simulation
  app.get('/payroll/employees/high_connection_load', async (req, res) => {
    newrelic.setTransactionName('payroll-system-high-connection-load');
    const connections = [];
    try {
      for (let i = 0; i < 20; i++) {
        const conn = await pool.connect();
        connections.push(conn);
        // No transaction needed for single read
        await conn.query(
          `
          SELECT 
            e.id,
            e.first_name,
            e.last_name,
            e.birth_date,
            e.gender,
            e.hire_date,
            s.amount as salary
          FROM employee e
          JOIN salary s ON e.id = s.employee_id
          WHERE e.id = $1
            AND s.to_date = '9999-01-01'
        `,
          [10001 + i]
        );
      }
      res.json({ status: 'ok' });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      connections.forEach((conn) => conn.release());
    }
  });

  // 5. Highest earners
  app.get('/payroll/reports/highest_earners', async (req, res) => {
    newrelic.setTransactionName('payroll-system-highest-earners');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT 
          e.id,
          e.first_name,
          e.last_name,
          e.birth_date,
          e.gender,
          e.hire_date,
          s.amount as salary,
          d.dept_name,
          t.title
        FROM employee e
        JOIN salary s ON e.id = s.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        JOIN title t ON e.id = t.employee_id
        WHERE s.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
        ORDER BY s.amount DESC
        LIMIT 100
      `);
      await client.query('COMMIT');
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  const port = process.env.PAYROLL_SYSTEM_PORT || 3001;
  app.listen(port, () => console.log(`Payroll System running on port ${port}`));
}

startPayrollSystem().catch(console.error);
