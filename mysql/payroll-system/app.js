// payroll-system/app.js
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

async function startPayrollSystem() {
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
  app.use(requestLogger('Payroll-System'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 1. Basic salary retrieval
  app.get('/payroll/salaries/by_employee', async (req, res) => {
    newrelic.setTransactionName('payroll-system-salary-by-employee');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.emp_no, e.first_name, e.last_name,
               s.salary, s.from_date, s.to_date,
               d.dept_name, t.title
        FROM employees e
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        JOIN titles t ON e.emp_no = t.emp_no
        WHERE e.emp_no = ?
        AND s.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
      `, [10001]);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 2. Salary range search (inefficient index usage)
  app.get('/payroll/salaries/by_range', async (req, res) => {
    newrelic.setTransactionName('payroll-system-salary-by-range');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.*, s.salary, d.dept_name
        FROM employees e
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        WHERE s.salary BETWEEN 50000 AND 70000
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

  // 3. Salary adjustment (long-running transaction)
  app.put('/payroll/salaries/adjust', async (req, res) => {
    newrelic.setTransactionName('payroll-system-salary-adjust');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      await connection.query(`
        UPDATE salaries s
        JOIN dept_emp de ON s.emp_no = de.emp_no
        SET s.to_date = CURDATE()
        WHERE de.dept_no = 'd005'
        AND s.to_date = '9999-01-01'
      `);

      await connection.query(`
        INSERT INTO salaries (emp_no, salary, from_date, to_date)
        SELECT s.emp_no, s.salary * 1.1, CURDATE(), '9999-01-01'
        FROM salaries s
        JOIN dept_emp de ON s.emp_no = de.emp_no
        WHERE de.dept_no = 'd005'
        AND s.to_date = CURDATE()
      `);
      
      // Artificial delay
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      await connection.commit();
      res.json({ status: 'ok' });
    } catch (err) {
      newrelic.noticeError(err);
      await connection.rollback();
      res.status(500).json({ error: err.message });
    } finally {
      connection.release();
    }
  });

  // 4. List by salary (inefficient sorting)
  app.get('/payroll/employees/list_by_salary', async (req, res) => {
    newrelic.setTransactionName('payroll-system-employee-list-by-salary');
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
        WHERE s.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
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

  // 5. Highest earners (no LIMIT)
  app.get('/payroll/reports/highest_earners', async (req, res) => {
    newrelic.setTransactionName('payroll-system-highest-earners');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.*, s.salary, d.dept_name, t.title
        FROM employees e
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        JOIN titles t ON e.emp_no = t.emp_no
        WHERE s.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
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

  // 6. Salary by year (function-based filter)
  app.get('/payroll/salaries/by_year', async (req, res) => {
    newrelic.setTransactionName('payroll-system-salary-by-year');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.emp_no, e.first_name, e.last_name,
               s.salary, s.from_date, s.to_date
        FROM employees e
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE YEAR(s.from_date) = 1995
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 7. Department average salary
  app.get('/payroll/departments/avg_salary', async (req, res) => {
    newrelic.setTransactionName('payroll-system-department-avg-salary');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT d.dept_name, 
               COUNT(DISTINCT e.emp_no) as emp_count,
               AVG(s.salary) as avg_salary,
               MAX(s.salary) as max_salary,
               MIN(s.salary) as min_salary
        FROM departments d
        JOIN dept_emp de ON d.dept_no = de.dept_no
        JOIN employees e ON de.emp_no = e.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE de.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
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

  // 8. Search by salary (implicit conversion)
  app.get('/payroll/employees/search_by_salary', async (req, res) => {
    newrelic.setTransactionName('payroll-system-employee-search-by-salary');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.emp_no, e.first_name, e.last_name,
               s.salary, t.title
        FROM employees e
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN titles t ON e.emp_no = t.emp_no
        WHERE s.salary BETWEEN '70000' AND '90000'
        AND s.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 9. High connection load simulation
  app.get('/payroll/employees/high_connection_load', async (req, res) => {
    newrelic.setTransactionName('payroll-system-high-connection-load');
    const connections = [];
    try {
      for (let i = 0; i < 20; i++) {
        const conn = await pool.getConnection();
        connections.push(conn);
        await conn.query(`
          SELECT e.*, s.salary
          FROM employees e
          JOIN salaries s ON e.emp_no = s.emp_no
          WHERE e.emp_no = ?
          AND s.to_date = '9999-01-01'
        `, [10001 + i]);
      }
      res.json({ status: 'ok' });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      connections.forEach(conn => conn.release());
    }
  });

  const port = process.env.PORT || 3001;
  app.listen(port, () => console.log(`Payroll System running on port ${port}`));
}

startPayrollSystem().catch(console.error);
