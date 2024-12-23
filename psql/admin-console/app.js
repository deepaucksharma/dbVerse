// admin-console/app.js
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

async function startAdminConsole() {
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
      // If this fails, release the client to avoid leaks
      client.release();
      throw err;
    }
  });

  const app = express();
  app.use(express.json());
  app.use(requestLogger('Admin-Console'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 1. Complex employee search
  app.get('/admin/employees/search', async (req, res) => {
    newrelic.setTransactionName('admin-console-employee-search');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT DISTINCT 
          e.id, e.first_name, e.last_name, e.hire_date,
          t.title, s.amount as salary, d.dept_name,
          (SELECT COUNT(*) FROM title t2 WHERE t2.employee_id = e.id) as role_changes,
          (SELECT MAX(amount) FROM salary s2 WHERE s2.employee_id = e.id) as highest_salary
        FROM employee e
        JOIN title t ON e.id = t.employee_id
        JOIN salary s ON e.id = s.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        WHERE (e.first_name ILIKE '%ar%' OR e.last_name ILIKE '%son%')
          AND t.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
          AND s.amount > 60000
          AND EXTRACT(YEAR FROM e.hire_date) > 1990
      `);
      await client.query('COMMIT');
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      newrelic.noticeError(err);
      console.error(`/admin/employees/search | Error: ${err.message}`, err);
      res.status(500).json({ error: `Database error: ${err.message}` });
    } finally {
      if (client) client.release();
    }
  });

  // 2. Bulk title update with transaction
  app.put('/admin/employees/bulk_title_update', async (req, res) => {
    newrelic.setTransactionName('admin-console-bulk-title-update');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        WITH current_titles AS (
          UPDATE title t
          SET to_date = CURRENT_DATE
          FROM department_employee de
          WHERE t.employee_id = de.employee_id
            AND de.department_id = 'd005'
            AND t.title = 'Engineer'
            AND t.to_date = '9999-01-01'
            AND de.to_date = '9999-01-01'
          RETURNING t.employee_id
        )
        INSERT INTO title (employee_id, title, from_date, to_date)
        SELECT employee_id, 'Senior Engineer', CURRENT_DATE, NULL
        FROM current_titles
      `);

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

  // 3. Department management audit
  app.get('/admin/departments/details', async (req, res) => {
    newrelic.setTransactionName('admin-console-department-details');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT 
          d.id as dept_no,
          d.dept_name,
          COUNT(DISTINCT de.employee_id) as current_employees,
          COUNT(DISTINCT dm.employee_id) as total_managers,
          MIN(dm.from_date) as first_manager_date,
          COUNT(DISTINCT t.title) as unique_titles,
          AVG(s.amount) as avg_salary,
          (SELECT COUNT(*) 
           FROM department_employee de2 
           WHERE de2.department_id = d.id 
             AND de2.to_date < CURRENT_DATE) as past_employees
        FROM department d
        LEFT JOIN department_employee de ON d.id = de.department_id AND de.to_date = '9999-01-01'
        LEFT JOIN department_manager dm ON d.id = dm.department_id
        LEFT JOIN title t ON de.employee_id = t.employee_id AND t.to_date = '9999-01-01'
        LEFT JOIN salary s ON de.employee_id = s.employee_id AND s.to_date = '9999-01-01'
        GROUP BY d.id, d.dept_name
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

  // 4. Employee details with history
  app.get('/admin/employees/details/:id', async (req, res) => {
    newrelic.setTransactionName('admin-console-employee-details');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(
        `
        SELECT 
          e.id, e.first_name, e.last_name, e.hire_date,
          t.title as current_title,
          s.amount as current_salary,
          d.dept_name as current_department,
          array_agg(DISTINCT t2.title ORDER BY t2.from_date) as title_history,
          array_agg(DISTINCT d2.dept_name || ': ' || 
            de2.from_date || ' to ' || 
            CASE WHEN de2.to_date = '9999-01-01' THEN 'present' 
                 ELSE de2.to_date::text END
            ORDER BY de2.from_date) as department_history
        FROM employee e
        JOIN title t ON e.id = t.employee_id AND t.to_date = '9999-01-01'
        JOIN salary s ON e.id = s.employee_id AND s.to_date = '9999-01-01'
        JOIN department_employee de ON e.id = de.employee_id AND de.to_date = '9999-01-01'
        JOIN department d ON de.department_id = d.id
        LEFT JOIN title t2 ON e.id = t2.employee_id
        LEFT JOIN department_employee de2 ON e.id = de2.employee_id
        LEFT JOIN department d2 ON de2.department_id = d2.id
        WHERE e.id = $1
        GROUP BY e.id, e.first_name, e.last_name, e.hire_date,
                 t.title, s.amount, d.dept_name
      `,
        [req.params.id]
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

  // 5. Data export (no connection leak)
  app.get('/admin/employees/data_export', async (req, res) => {
    newrelic.setTransactionName('admin-console-data-export');
    let client;
    try {
      client = await pool.connect();
      const result = await client.query(`
        SELECT e.*, s.amount as salary, t.title, d.dept_name
        FROM employee e
        JOIN salary s ON e.id = s.employee_id
        JOIN title t ON e.id = t.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        WHERE s.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
      `);
      res.json({ status: 'ok', data: result.rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  const port = process.env.PORT || 3004;
  app.listen(port, () => console.log(`Admin Console running on port ${port}`));
}

startAdminConsole().catch(console.error);
