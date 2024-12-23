// hr-portal/app.js
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

async function startHRPortal() {
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

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });

  const app = express();
  app.use(express.json());
  app.use(requestLogger('HR-Portal'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 1. Search by hire_date (missing index)
  app.get('/hr/employees/search', async (req, res) => {
    newrelic.setTransactionName('hr-portal-employee-search');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT e.*, t.title, s.amount as salary, d.dept_name
        FROM employee e
        LEFT JOIN title t ON e.id = t.employee_id AND t.to_date = '9999-01-01'
        LEFT JOIN salary s ON e.id = s.employee_id AND s.to_date = '9999-01-01'
        LEFT JOIN department_employee de ON e.id = de.employee_id AND de.to_date = '9999-01-01'
        LEFT JOIN department d ON de.department_id = d.id
        WHERE e.hire_date = '1990-01-15'
      `);
      await client.query('COMMIT');
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      newrelic.noticeError(err);
      console.error(`/hr/employees/search | Error: ${err.message}`, err);
      res.status(500).json({ error: `Database error: ${err.message}` });
    } finally {
      if (client) client.release();
    }
  });

  // 2. Search by name or department (inefficient OR + LIKE)
  app.get('/hr/employees/search_by_name_or_dept', async (req, res) => {
    newrelic.setTransactionName('hr-portal-employee-search-by-name-or-dept');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT DISTINCT e.*, d.dept_name
        FROM employee e
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        WHERE (e.first_name ILIKE '%Geo%' OR e.last_name ILIKE '%son%')
           OR de.department_id = 'd005'
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

  // 3. List all employees
  app.get('/hr/employees/list', async (req, res) => {
    newrelic.setTransactionName('hr-portal-employee-list');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT e.*, d.dept_name, t.title, s.amount AS salary
        FROM employee e
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        JOIN title t ON e.id = t.employee_id
        JOIN salary s ON e.id = s.employee_id
        WHERE de.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
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

  // 4. Transfer employees
  app.post('/hr/employees/transfer', async (req, res) => {
    newrelic.setTransactionName('hr-portal-employee-transfer');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE department_employee
        SET to_date = CURRENT_DATE
        WHERE department_id = 'd005'
          AND to_date = '9999-01-01'
          AND employee_id IN (
            SELECT de.employee_id
            FROM department_employee de
            WHERE de.department_id = 'd005'
              AND de.to_date = '9999-01-01'
              AND NOT EXISTS (
                SELECT 1
                FROM department_employee de2
                WHERE de2.employee_id = de.employee_id
                  AND de2.department_id = 'd001'
                  AND de2.to_date = '9999-01-01'
              )
            LIMIT 100
          );
      `);
      await client.query(`
        INSERT INTO department_employee (employee_id, department_id, from_date, to_date)
        SELECT de.employee_id, 'd001', CURRENT_DATE, '9999-01-01'
        FROM department_employee de
        WHERE de.department_id = 'd005'
          AND de.to_date = CURRENT_DATE
        ON CONFLICT (employee_id, department_id) DO NOTHING;
      `);
      await client.query('COMMIT');
      res.json({ status: 'ok', transferred: 100 });
    } catch (err) {
      await client.query('ROLLBACK');
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 5. Update salary
  app.put('/hr/employees/update_salary', async (req, res) => {
    newrelic.setTransactionName('hr-portal-employee-update-salary');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { emp_no, salary } = req.body;
      const employeeId =
        emp_no ||
        (
          await client.query(`SELECT id FROM employee ORDER BY random() LIMIT 1`)
        ).rows[0].id;

      // 1) End old salary
      await client.query(
        `
        UPDATE salary
        SET to_date = CURRENT_DATE
        WHERE employee_id = $1 AND to_date = '9999-01-01'
      `,
        [employeeId]
      );

      // 2) Insert new row
      await client.query(
        `
        INSERT INTO salary (employee_id, amount, from_date, to_date)
        VALUES (
          $1,
          COALESCE($2,
            (SELECT amount * (1 + (random() * 0.2))
             FROM salary
             WHERE employee_id = $1
               AND to_date = CURRENT_DATE)
          ),
          CURRENT_DATE,
          '9999-01-01'
        )
      `,
        [employeeId, salary]
      );

      await client.query('COMMIT');
      res.json({ status: 'ok' });
    } catch (err) {
      await client.query('ROLLBACK');
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`HR Portal running on port ${port}`));
}

startHRPortal().catch(console.error);
