// Ensure newrelic is the first import
const newrelic = require('newrelic');
const express = require('express');
const { Pool } = require('pg');

const requestLogger = (serviceName) => (req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    newrelic.addCustomAttribute('responseTime', duration);
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
    newrelic.noticeError(err);
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
    newrelic.setTransactionName('System/HealthCheck');
    res.json({ status: 'ok' });
  });

  app.get('/reports/employees/list_all', async (req, res) => {
    newrelic.setTransactionName('Report/Employee/ListAll');
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
          d.dept_name,
          t.title,
          s.amount as salary,
          EXTRACT(DAY FROM (CURRENT_DATE - e.hire_date)) as days_employed
        FROM employee e
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        JOIN title t ON e.id = t.employee_id
        JOIN salary s ON e.id = s.employee_id
        WHERE de.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
        ORDER BY e.id
        LIMIT 1000
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

  app.get('/reports/departments/average_salary', async (req, res) => {
    newrelic.setTransactionName('Report/Department/AverageSalary');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT 
          d.id as dept_id,
          d.dept_name,
          COUNT(DISTINCT e.id) as employee_count,
          ROUND(AVG(s.amount)::numeric, 2) as avg_salary,
          MIN(s.amount) as min_salary,
          MAX(s.amount) as max_salary,
          COUNT(DISTINCT t.title) as title_count
        FROM department d
        JOIN department_employee de ON d.id = de.department_id
        JOIN employee e ON de.employee_id = e.id
        JOIN salary s ON e.id = s.employee_id
        JOIN title t ON e.id = t.employee_id
        WHERE de.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
        GROUP BY d.id, d.dept_name
        ORDER BY avg_salary DESC
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

  app.get('/reports/employees/long_tenure', async (req, res) => {
    newrelic.setTransactionName('Report/Employee/LongTenure');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        WITH tenure_calc AS (
          SELECT 
            e.id,
            e.first_name,
            e.last_name,
            e.birth_date,
            e.gender,
            e.hire_date,
            DATE_PART('day', CURRENT_DATE - e.hire_date) as tenure_days
          FROM employee e
          WHERE DATE_PART('day', CURRENT_DATE - e.hire_date) > 365 * 10
        )
        SELECT 
          t.*,
          COUNT(DISTINCT tt.title) as number_of_titles,
          COUNT(DISTINCT de.department_id) as number_of_departments
        FROM tenure_calc t
        JOIN title tt ON t.id = tt.employee_id
        JOIN department_employee de ON t.id = de.employee_id
        GROUP BY t.id, t.first_name, t.last_name, t.birth_date, 
                 t.gender, t.hire_date, t.tenure_days
        ORDER BY t.tenure_days DESC
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

  app.get('/reports/salaries/highest_by_dept', async (req, res) => {
    newrelic.setTransactionName('Report/Salary/HighestByDepartment');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        WITH ranked_salaries AS (
          SELECT 
            d.dept_name,
            e.first_name,
            e.last_name,
            s.amount as salary,
            (
              SELECT COUNT(DISTINCT s2.amount) + 1
              FROM salary s2
              JOIN department_employee de2 ON s2.employee_id = de2.employee_id
              WHERE de2.department_id = de.department_id
                AND s2.amount > s.amount
                AND s2.to_date = '9999-01-01'
                AND de2.to_date = '9999-01-01'
            ) as salary_rank_in_dept
          FROM department d
          JOIN department_employee de ON d.id = de.department_id
          JOIN employee e ON de.employee_id = e.id
          JOIN salary s ON e.id = s.employee_id
          WHERE de.to_date = '9999-01-01'
            AND s.to_date = '9999-01-01'
        )
        SELECT *
        FROM ranked_salaries
        WHERE salary_rank_in_dept <= 5
        ORDER BY dept_name, salary_rank_in_dept
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

  app.get('/reports/employees/concurrent_report_generation', async (req, res) => {
    newrelic.setTransactionName('Report/Employee/ConcurrentGeneration');
    const connections = [];
    try {
      const promises = Array(15).fill().map(async () => {
        const conn = await pool.connect();
        connections.push(conn);
        return conn.query(`
          SELECT 
            e.id,
            e.first_name,
            e.last_name,
            e.birth_date,
            e.gender,
            e.hire_date,
            s.amount as salary,
            t.title
          FROM employee e
          JOIN salary s ON e.id = s.employee_id
          JOIN title t ON e.id = t.employee_id
          WHERE s.to_date = '9999-01-01'
            AND t.to_date = '9999-01-01'
            AND e.hire_date BETWEEN '1985-01-01' AND '1995-12-31'
        `);
      });

      await Promise.all(promises);
      res.json({ status: 'ok' });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      connections.forEach((conn) => conn.release());
    }
  });

  const port = process.env.PORT || 3002;
  const server = app.listen(port, () => {
    console.log(`Reporting Dashboard running on port ${port}`);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
      console.log('Server closed. Cleaning up...');
      pool.end().then(() => {
        console.log('Database pool closed.');
        process.exit(0);
      });
    });
  });
}

startReportingDashboard().catch(err => {
  newrelic.noticeError(err);
  console.error('Failed to start Reporting Dashboard:', err);
  process.exit(1);
});
