// reporting-dashboard/app.js
const newrelic = require('newrelic');
console.log('New Relic agent status:', newrelic.agent.config.agent_enabled);
const express = require('express');
const mysql = require('mysql2/promise');

// Basic logging middleware
const requestLogger = (serviceName) => (req, res, next) => {
  const startTime = Date.now();
  
  // Override res.json to capture the response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    console.log(`${serviceName} | ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | ${duration}ms${data.error ? ` | Error: ${data.error}` : ''}`);
    return originalJson.apply(this, arguments);
  };

  next();
};

async function startReportingDashboard() {
  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'employees',
    connectionLimit: 10,
    queueLimit: 0,
    waitForConnections: true
  });

  const app = express();
  app.use(express.json());
  app.use(requestLogger('Reporting-Dashboard'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 1. List all employees with full details (expensive join)
  app.get('/reports/employees/list_all', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-employee-list-all');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.*, d.dept_name, t.title, s.salary,
               DATEDIFF(CURDATE(), e.hire_date) as days_employed
        FROM employees e
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE de.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        ORDER BY e.emp_no
        LIMIT 1000
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 2. Department salary statistics (complex aggregation)
  app.get('/reports/departments/average_salary', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-department-average-salary');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          d.dept_name,
          COUNT(DISTINCT e.emp_no) as employee_count,
          ROUND(AVG(s.salary), 2) as avg_salary,
          MIN(s.salary) as min_salary,
          MAX(s.salary) as max_salary,
          COUNT(DISTINCT t.title) as title_count
        FROM departments d
        JOIN dept_emp de ON d.dept_no = de.dept_no
        JOIN employees e ON de.emp_no = e.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN titles t ON e.emp_no = t.emp_no
        WHERE de.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
        GROUP BY d.dept_name
        ORDER BY avg_salary DESC
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 3. Employee hire date analysis (function-based WHERE)
  app.get('/reports/employees/by_hire_date', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-employee-by-hire-date');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          YEAR(hire_date) as hire_year,
          MONTH(hire_date) as hire_month,
          COUNT(*) as hire_count,
          COUNT(DISTINCT de.dept_no) as dept_count
        FROM employees e
        JOIN dept_emp de ON e.emp_no = de.emp_no
        WHERE YEAR(hire_date) BETWEEN 1985 AND 1995
        GROUP BY hire_year, hire_month
        ORDER BY hire_year, hire_month
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 4. Department headcount trends (correlated subquery)
  app.get('/reports/employees/by_dept', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-employee-by-dept');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          d.dept_name,
          COUNT(de.emp_no) as current_count,
          (
            SELECT COUNT(*)
            FROM dept_emp de2
            WHERE de2.dept_no = d.dept_no
            AND YEAR(de2.from_date) = YEAR(CURDATE())
          ) as new_hires_this_year,
          (
            SELECT COUNT(*)
            FROM dept_emp de3
            WHERE de3.dept_no = d.dept_no
            AND YEAR(de3.to_date) = YEAR(CURDATE())
            AND de3.to_date != '9999-01-01'
          ) as departures_this_year
        FROM departments d
        JOIN dept_emp de ON d.dept_no = de.dept_no
        WHERE de.to_date = '9999-01-01'
        GROUP BY d.dept_name
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 5. Salary distribution by title (temp tables)
  app.get('/reports/employees/by_title', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-employee-by-title');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          t.title,
          COUNT(*) as employee_count,
          ROUND(AVG(s.salary), 2) as avg_salary,
          MIN(s.salary) as min_salary,
          MAX(s.salary) as max_salary,
          ROUND(STDDEV(s.salary), 2) as salary_stddev
        FROM titles t
        JOIN salaries s ON t.emp_no = s.emp_no
        WHERE t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        GROUP BY t.title
        ORDER BY avg_salary DESC
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 6. Employee tenure analysis (date calculations)
  app.get('/reports/employees/long_tenure', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-employee-long-tenure');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          e.emp_no,
          e.first_name,
          e.last_name,
          e.hire_date,
          DATEDIFF(CURDATE(), e.hire_date) as tenure_days,
          COUNT(DISTINCT t.title) as number_of_titles,
          COUNT(DISTINCT de.dept_no) as number_of_departments
        FROM employees e
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        WHERE DATEDIFF(CURDATE(), hire_date) > 365 * 10
        GROUP BY e.emp_no, e.first_name, e.last_name, e.hire_date
        ORDER BY tenure_days DESC
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 7. Department salary rankings (window functions simulation)
  app.get('/reports/salaries/highest_by_dept', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-salaries-highest-by-dept');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          d.dept_name,
          e.first_name,
          e.last_name,
          s.salary,
          (
            SELECT COUNT(DISTINCT s2.salary) + 1
            FROM salaries s2
            JOIN dept_emp de2 ON s2.emp_no = de2.emp_no
            WHERE de2.dept_no = de.dept_no
            AND s2.salary > s.salary
            AND s2.to_date = '9999-01-01'
            AND de2.to_date = '9999-01-01'
          ) as salary_rank_in_dept
        FROM departments d
        JOIN dept_emp de ON d.dept_no = de.dept_no
        JOIN employees e ON de.emp_no = e.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE de.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        HAVING salary_rank_in_dept <= 5
        ORDER BY d.dept_name, salary_rank_in_dept
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 8. Concurrent report generation (connection stress)
  app.get('/reports/employees/concurrent_report_generation', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-concurrent-report-generation');
    const connections = [];
    try {
      const promises = Array(15).fill().map(async () => {
        const conn = await pool.getConnection();
        connections.push(conn);
        return conn.query(`
          SELECT e.*, s.salary, t.title
          FROM employees e
          JOIN salaries s ON e.emp_no = s.emp_no
          JOIN titles t ON e.emp_no = t.emp_no
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
      connections.forEach(conn => conn.release());
    }
  });

  // 9. Salary range analysis (string comparison)
  app.get('/reports/employees/search_by_salary_range', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-employee-search-by-salary-range');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.emp_no, e.first_name, e.last_name,
               s.salary, t.title, d.dept_name
        FROM employees e
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        WHERE s.salary BETWEEN '60000' AND '80000'
        AND t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
        ORDER BY s.salary DESC
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

    // Add the missing search by name endpoint
  app.get('/reports/employees/search_by_name', async (req, res) => {
    newrelic.setTransactionName('reporting-dashboard-employee-search-by-name');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          e.emp_no,
          e.first_name,
          e.last_name,
          t.title,
          d.dept_name,
          s.salary
        FROM employees e
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE (e.first_name LIKE '%John%' OR e.last_name LIKE '%Smith%')
        AND t.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        ORDER BY e.last_name, e.first_name
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  const port = process.env.PORT || 3002;
  app.listen(port, () => console.log(`Reporting Dashboard running on port ${port}`));
}

startReportingDashboard().catch(console.error);
