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

async function startPerformanceReview() {
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
  app.use(requestLogger('Performance-Review'));

  app.get('/health', (req, res) => {
    newrelic.setTransactionName('System/HealthCheck');
    res.json({ status: 'ok' });
  });

  app.get('/perf/employees/list', async (req, res) => {
    newrelic.setTransactionName('Performance/Employee/List');
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query(`
        SELECT 
          e.id,
          e.first_name,
          e.last_name,
          t.title,
          d.dept_name,
          s.amount as salary,
          EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.hire_date)) as years_of_service,
          (SELECT COUNT(DISTINCT title) FROM title WHERE employee_id = e.id) as role_changes,
          (SELECT MAX(amount) - MIN(amount) FROM salary WHERE employee_id = e.id) as salary_growth
        FROM employee e
        JOIN title t ON e.id = t.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        JOIN salary s ON e.id = s.employee_id
        WHERE t.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
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

  app.get('/perf/employees/career_progression', async (req, res) => {
    newrelic.setTransactionName('Performance/Employee/CareerProgression');
    let client;
    try {
      client = await pool.connect();
      const { rows } = await client.query(`
        SELECT 
          e.id,
          e.first_name,
          e.last_name,
          t1.title as current_title,
          t1.from_date as current_title_date,
          s.amount as current_salary,
          d.dept_name,
          (SELECT title 
           FROM title t2 
           WHERE t2.employee_id = e.id 
             AND t2.from_date < t1.from_date 
           ORDER BY t2.from_date DESC 
           LIMIT 1) as previous_title,
          (SELECT amount 
           FROM salary s2 
           WHERE s2.employee_id = e.id 
             AND s2.from_date < s.from_date 
           ORDER BY s2.from_date DESC 
           LIMIT 1) as previous_salary
        FROM employee e
        JOIN title t1 ON e.id = t1.employee_id
        JOIN salary s ON e.id = s.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        WHERE t1.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  app.get('/perf/departments/avg_score', async (req, res) => {
    newrelic.setTransactionName('Performance/Department/AverageScore');
    let client;
    try {
      client = await pool.connect();
      const { rows } = await client.query(`
        SELECT 
          d.dept_name,
          COUNT(DISTINCT e.id) as employee_count,
          AVG(s.amount) as avg_salary,
          MAX(s.amount) as max_salary,
          MIN(s.amount) as min_salary,
          COUNT(DISTINCT t.title) as title_diversity,
          AVG(EXTRACT(DAY FROM (CURRENT_DATE - e.hire_date))) as avg_tenure_days,
          (SELECT COUNT(DISTINCT t2.employee_id) 
           FROM title t2 
           WHERE t2.title ILIKE 'Senior%' 
             AND t2.employee_id IN (
               SELECT employee_id 
               FROM department_employee de2 
               WHERE de2.department_id = d.id 
                 AND de2.to_date = '9999-01-01'
             )
          ) as senior_employees
        FROM department d
        JOIN department_employee de ON d.id = de.department_id
        JOIN employee e ON de.employee_id = e.id
        JOIN title t ON e.id = t.employee_id
        JOIN salary s ON e.id = s.employee_id
        WHERE de.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
        GROUP BY d.dept_name
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  app.get('/perf/employees/top_performers', async (req, res) => {
    newrelic.setTransactionName('Performance/Employee/TopPerformers');
    let client;
    try {
      client = await pool.connect();
      const { rows } = await client.query(`
        WITH AvgDeptSalary AS (
          SELECT de.department_id, AVG(s.amount) AS avg_salary
          FROM department_employee de
          JOIN salary s ON de.employee_id = s.employee_id
          WHERE s.to_date = '9999-01-01'
          GROUP BY de.department_id
        )
        SELECT 
          e.id,
          e.first_name,
          e.last_name,
          t.title,
          s.amount AS salary,
          d.dept_name,
          s.amount - ads.avg_salary AS salary_above_dept_avg
        FROM employee e
        JOIN title t ON e.id = t.employee_id
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        JOIN salary s ON e.id = s.employee_id
        JOIN AvgDeptSalary ads ON de.department_id = ads.department_id
        WHERE t.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
          AND s.amount > ads.avg_salary
        ORDER BY salary_above_dept_avg DESC
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  app.get('/perf/reports/annual_performance_summary', async (req, res) => {
    newrelic.setTransactionName('Performance/Report/AnnualSummary');
    let client;
    try {
      client = await pool.connect();
      const { rows } = await client.query(`
        SELECT 
          EXTRACT(YEAR FROM s.from_date) as year,
          d.dept_name,
          COUNT(DISTINCT e.id) as total_employees,
          AVG(s.amount) as avg_salary,
          COUNT(DISTINCT t.title) as title_count,
          SUM(CASE WHEN t.title ILIKE 'Senior%' THEN 1 ELSE 0 END) as senior_positions
        FROM employee e
        JOIN department_employee de ON e.id = de.employee_id
        JOIN department d ON de.department_id = d.id
        JOIN title t ON e.id = t.employee_id
        JOIN salary s ON e.id = s.employee_id
        WHERE t.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
          AND s.to_date = '9999-01-01'
        GROUP BY EXTRACT(YEAR FROM s.from_date), d.dept_name
        ORDER BY year DESC, d.dept_name
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (client) client.release();
    }
  });

  const port = process.env.PORT || 3003;
  const server = app.listen(port, () => {
    console.log(`Performance Review System running on port ${port}`);
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

startPerformanceReview().catch(err => {
  newrelic.noticeError(err);
  console.error('Failed to start Performance Review System:', err);
  process.exit(1);
});
