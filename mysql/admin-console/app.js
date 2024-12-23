// admin-console/app.js
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

async function startAdminConsole() {
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
  app.use(requestLogger('Admin-Console'));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 1. Complex employee search
  app.get('/admin/employees/search', async (req, res) => {
    newrelic.setTransactionName('admin-console-employee-search');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT DISTINCT 
          e.emp_no, e.first_name, e.last_name, e.hire_date,
          t.title, s.salary, d.dept_name,
          (SELECT COUNT(*) 
           FROM titles t2 
           WHERE t2.emp_no = e.emp_no) as role_changes,
          (SELECT MAX(salary) 
           FROM salaries s2 
           WHERE s2.emp_no = e.emp_no) as highest_salary
        FROM employees e
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        WHERE (e.first_name LIKE '%ar%' OR e.last_name LIKE '%son%')
        AND t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
        AND s.salary > 60000
        AND YEAR(e.hire_date) > 1990
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 2. Bulk title update with transaction
  app.put('/admin/employees/bulk_title_update', async (req, res) => {
    newrelic.setTransactionName('admin-console-bulk-title-update');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // End current titles
      await connection.query(`
        UPDATE titles t
        JOIN dept_emp de ON t.emp_no = de.emp_no
        SET t.to_date = CURDATE()
        WHERE de.dept_no = 'd005'
        AND t.title = 'Engineer'
        AND t.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
      `);
      
      // Insert new titles
      await connection.query(`
        INSERT INTO titles (emp_no, title, from_date, to_date)
        SELECT t.emp_no, 'Senior Engineer', CURDATE(), '9999-01-01'
        FROM titles t
        JOIN dept_emp de ON t.emp_no = de.emp_no
        WHERE de.dept_no = 'd005'
        AND t.to_date = CURDATE()
        AND de.to_date = '9999-01-01'
      `);
      
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

  // 3. Department management audit
  app.get('/admin/departments/details', async (req, res) => {
    newrelic.setTransactionName('admin-console-department-details');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          d.dept_no,
          d.dept_name,
          COUNT(DISTINCT de.emp_no) as current_employees,
          COUNT(DISTINCT dm.emp_no) as total_managers,
          MIN(dm.from_date) as first_manager_date,
          COUNT(DISTINCT t.title) as unique_titles,
          AVG(s.salary) as avg_salary,
          (SELECT COUNT(*) 
           FROM dept_emp de2 
           WHERE de2.dept_no = d.dept_no 
           AND de2.to_date < CURDATE()) as past_employees
        FROM departments d
        LEFT JOIN dept_emp de ON d.dept_no = de.dept_no AND de.to_date = '9999-01-01'
        LEFT JOIN dept_manager dm ON d.dept_no = dm.dept_no
        LEFT JOIN titles t ON de.emp_no = t.emp_no AND t.to_date = '9999-01-01'
        LEFT JOIN salaries s ON de.emp_no = s.emp_no AND s.to_date = '9999-01-01'
        GROUP BY d.dept_no, d.dept_name
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 4. Employee details with history
  app.get('/admin/employees/details', async (req, res) => {
    newrelic.setTransactionName('admin-console-employee-details');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          e.emp_no, e.first_name, e.last_name, e.hire_date,
          t.title as current_title,
          s.salary as current_salary,
          d.dept_name as current_department,
          (SELECT GROUP_CONCAT(title ORDER BY from_date SEPARATOR ', ')
           FROM titles
           WHERE emp_no = e.emp_no) as title_history,
          (SELECT GROUP_CONCAT(CONCAT(dept_name, ': ', de2.from_date, ' to ', 
            CASE WHEN de2.to_date = '9999-01-01' THEN 'present' 
                 ELSE de2.to_date END)
            ORDER BY de2.from_date SEPARATOR '; ')
           FROM dept_emp de2 
           JOIN departments d2 ON de2.dept_no = d2.dept_no
           WHERE de2.emp_no = e.emp_no) as department_history
        FROM employees e
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        WHERE e.emp_no = 10001
        AND t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 5. Salary audit report
  app.get('/admin/reports/salary_audit', async (req, res) => {
    newrelic.setTransactionName('admin-console-salary-audit');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          e.emp_no, e.first_name, e.last_name,
          s1.salary as current_salary,
          s1.from_date as current_salary_date,
          (SELECT s2.salary 
           FROM salaries s2 
           WHERE s2.emp_no = e.emp_no 
           AND s2.to_date < '9999-01-01' 
           ORDER BY s2.to_date DESC LIMIT 1) as previous_salary,
          d.dept_name,
          t.title,
          (SELECT AVG(s3.salary) 
           FROM salaries s3 
           JOIN dept_emp de2 ON s3.emp_no = de2.emp_no 
           WHERE de2.dept_no = de.dept_no 
           AND s3.to_date = '9999-01-01') as dept_avg_salary
        FROM employees e
        JOIN salaries s1 ON e.emp_no = s1.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        JOIN titles t ON e.emp_no = t.emp_no
        WHERE s1.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
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

  // 6. Employee transfer audit
  app.get('/admin/reports/transfer_audit', async (req, res) => {
    newrelic.setTransactionName('admin-console-transfer-audit');
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          d1.dept_name as from_department,
          d2.dept_name as to_department,
          COUNT(*) as transfer_count,
          AVG(DATEDIFF(de2.from_date, de1.from_date)) as avg_days_between_transfers
        FROM dept_emp de1
        JOIN dept_emp de2 ON de1.emp_no = de2.emp_no
        JOIN departments d1 ON de1.dept_no = d1.dept_no
        JOIN departments d2 ON de2.dept_no = d2.dept_no
        WHERE de2.from_date > de1.from_date
        AND NOT EXISTS (
          SELECT 1 FROM dept_emp de3
          WHERE de3.emp_no = de1.emp_no
          AND de3.from_date > de1.from_date
          AND de3.from_date < de2.from_date
        )
        GROUP BY d1.dept_name, d2.dept_name
        HAVING transfer_count > 1
        ORDER BY transfer_count DESC
      `);
      res.json({ status: 'ok', data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 7. Data export with connection leaks
  app.get('/admin/employees/data_export', async (req, res) => {
    newrelic.setTransactionName('admin-console-data-export');
    const connections = [];
    try {
      for (let i = 0; i < 10; i++) {
        const connection = await pool.getConnection();
        connections.push(connection);
        await connection.query(`
          SELECT e.*, s.salary, t.title, d.dept_name
          FROM employees e
          JOIN salaries s ON e.emp_no = s.emp_no
          JOIN titles t ON e.emp_no = t.emp_no
          JOIN dept_emp de ON e.emp_no = de.emp_no
          JOIN departments d ON de.dept_no = d.dept_no
          WHERE s.to_date = '9999-01-01'
          AND t.to_date = '9999-01-01'
          AND de.to_date = '9999-01-01'
          LIMIT 1000 OFFSET ${i * 1000}
        `);
      }
      res.json({ status: 'ok' });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      // Delayed release to simulate connection leaks
      setTimeout(() => {
        connections.forEach(conn => conn.release());
      }, 5000);
    }
  });

  // 8. Inefficient prepared statements
  app.put('/admin/employees/update_multiple', async (req, res) => {
    newrelic.setTransactionName('admin-console-update-multiple');
    let connection;
    try {
      connection = await pool.getConnection();
      const [employees] = await connection.query(`
        SELECT emp_no FROM employees LIMIT 100
      `);

      // Prepare statement for each update instead of reusing
      for (const emp of employees) {
        await connection.query(`
          UPDATE employees 
          SET last_name = CONCAT(last_name, ?)
          WHERE emp_no = ?
        `, ['-updated', emp.emp_no]);
      }
      res.json({ status: 'ok' });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  const port = process.env.PORT || 3004;
  app.listen(port, () => console.log(`Admin Console running on port ${port}`));
}

startAdminConsole().catch(console.error);
