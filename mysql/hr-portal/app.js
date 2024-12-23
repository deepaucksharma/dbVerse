const newrelic = require("newrelic");
console.log("New Relic agent status:", newrelic.agent.config.agent_enabled);
const express = require("express");
const mysql = require("mysql2/promise");

// Basic logging middleware
const requestLogger = (serviceName) => (req, res, next) => {
  const startTime = Date.now();

  // Override res.json to capture the response
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    console.log(
      `${serviceName} | ${req.method} ${req.originalUrl} | Status: ${
        res.statusCode
      } | ${duration}ms${data.error ? ` | Error: ${data.error}` : ""}`
    );
    return originalJson.apply(this, arguments);
  };

  next();
};

async function startHRPortal() {
  const pool = await mysql.createPool({
    host: process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "employees",
    connectionLimit: 10,
    queueLimit: 0,
    waitForConnections: true,
  });

  const app = express();
  app.use(express.json());
  app.use(requestLogger("HR-Portal"));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // 1. Search by hire_date (missing index)
  app.get("/hr/employees/search", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employee-search");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.*, t.title, s.salary, d.dept_name 
        FROM employees e
        LEFT JOIN titles t ON e.emp_no = t.emp_no AND t.to_date = '9999-01-01'
        LEFT JOIN salaries s ON e.emp_no = s.emp_no AND s.to_date = '9999-01-01'
        LEFT JOIN dept_emp de ON e.emp_no = de.emp_no AND de.to_date = '9999-01-01'
        LEFT JOIN departments d ON de.dept_no = d.dept_no
        WHERE e.hire_date = '1990-01-15'
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 2. Search by name or department (inefficient OR + LIKE)
  app.get("/hr/employees/search_by_name_or_dept", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employee-search-by-name-or-dept");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT DISTINCT e.*, d.dept_name 
        FROM employees e
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        WHERE (e.first_name LIKE '%Geo%' OR e.last_name LIKE '%son%')
        OR (de.dept_no = 'd005' AND de.to_date = '9999-01-01')
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 3. List all employees (SELECT * with multiple joins)
  app.get("/hr/employees/list", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employee-list");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.*, d.dept_name, t.title, s.salary
        FROM employees e
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE de.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 4. Employee transfer (N+1 query pattern)
  app.post("/hr/employees/transfer", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employee-transfer");
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Get employees to transfer
      const [employees] = await connection.query(`
        SELECT de.emp_no 
        FROM dept_emp de
        WHERE de.dept_no = 'd005' 
        AND de.to_date = '9999-01-01'
        AND NOT EXISTS (
          SELECT 1 FROM dept_emp de2
          WHERE de2.emp_no = de.emp_no
          AND de2.dept_no = 'd001'
          AND de2.to_date = '9999-01-01'
        )
        LIMIT 100
      `);

      // N+1 pattern intentionally preserved for performance testing
      for (const emp of employees) {
        await connection.query(
          `
          UPDATE dept_emp 
          SET to_date = CURDATE() 
          WHERE emp_no = ? 
          AND to_date = '9999-01-01'
        `,
          [emp.emp_no]
        );

        await connection.query(
          `
          INSERT INTO dept_emp (emp_no, dept_no, from_date, to_date)
          VALUES (?, 'd001', CURDATE(), '9999-01-01')
        `,
          [emp.emp_no]
        );
      }

      await connection.commit();
      res.json({ status: "ok", transferred: employees.length });
    } catch (err) {
      newrelic.noticeError(err);
      await connection.rollback();
      res.status(500).json({ error: err.message });
    } finally {
      connection.release();
    }
  });

  // 5. Update salary with default values
  app.put("/hr/employees/update_salary", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employee-update-salary");
    let connection;
    try {
      connection = await pool.getConnection();
      // Get a random employee if none provided
      let emp_no = req.body.emp_no;
      if (!emp_no) {
        const [emps] = await connection.query(`
        SELECT emp_no FROM employees ORDER BY RAND() LIMIT 1
      `);
        emp_no = emps[0].emp_no;
      }

      // Generate random salary increase if none provided
      let salary = req.body.salary;
      if (!salary) {
        const [current] = await connection.query(
          `
        SELECT salary FROM salaries 
        WHERE emp_no = ? AND to_date = '9999-01-01'
      `,
          [emp_no]
        );
        salary = Math.floor(current[0].salary * (1 + Math.random() * 0.2));
      }

      await connection.query(
        `
      UPDATE salaries 
      SET to_date = CURDATE()
      WHERE emp_no = ? 
      AND to_date = '9999-01-01'
    `,
        [emp_no]
      );

      await connection.query(
        `
      INSERT INTO salaries (emp_no, salary, from_date, to_date)
      VALUES (?, ?, CURDATE(), '9999-01-01')
    `,
        [emp_no, salary]
      );

      res.json({ status: "ok" });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 6. Employees by department
  app.get("/hr/reports/employees_by_department", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employees-by-department");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT d.dept_no, d.dept_name, 
               COUNT(DISTINCT e.emp_no) as employee_count,
               AVG(s.salary) as avg_salary
        FROM departments d
        JOIN dept_emp de ON d.dept_no = de.dept_no
        JOIN employees e ON de.emp_no = e.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE de.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        GROUP BY d.dept_no, d.dept_name
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Add to hr-portal/app.js
  app.get("/hr/reports/employees/sorted", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employees-sorted");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
      SELECT 
        e.emp_no,
        e.first_name,
        e.last_name,
        e.hire_date,
        t.title,
        s.salary,
        d.dept_name,
        DATEDIFF(CURDATE(), e.hire_date) as days_employed
      FROM employees e
      JOIN titles t ON e.emp_no = t.emp_no
      JOIN salaries s ON e.emp_no = s.emp_no
      JOIN dept_emp de ON e.emp_no = de.emp_no
      JOIN departments d ON de.dept_no = d.dept_no
      WHERE t.to_date = '9999-01-01'
      AND s.to_date = '9999-01-01'
      AND de.to_date = '9999-01-01'
      ORDER BY days_employed DESC, salary DESC
    `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Add missing salary distribution endpoint
  app.get("/hr/reports/salary/distribution", async (req, res) => {
    newrelic.setTransactionName("hr-portal-salary-distribution");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          FLOOR(salary/10000)*10000 as salary_range,
          COUNT(*) as employee_count
        FROM salaries
        WHERE to_date = '9999-01-01'
        GROUP BY salary_range
        ORDER BY salary_range
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Add missing salary above average endpoint
  app.get("/hr/reports/salary/above_average", async (req, res) => {
    newrelic.setTransactionName("hr-portal-salary-above-average");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        WITH avg_salary AS (
          SELECT AVG(salary) as avg_sal
          FROM salaries
          WHERE to_date = '9999-01-01'
        )
        SELECT 
          e.emp_no,
          e.first_name,
          e.last_name,
          s.salary,
          t.title,
          d.dept_name,
          s.salary - avg_salary.avg_sal as difference_from_avg
        FROM employees e
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        CROSS JOIN avg_salary
        WHERE s.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
        AND s.salary > avg_salary.avg_sal
        ORDER BY difference_from_avg DESC
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Add missing employee performance endpoint
  app.get("/hr/employees/performance", async (req, res) => {
    newrelic.setTransactionName("hr-portal-employee-performance");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT e.emp_no, e.first_name, e.last_name,
               t.title,
               s.salary,
               DATEDIFF(CURDATE(), e.hire_date)/365 as years_employed
        FROM employees e
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Add error handling middleware
  app.use((err, req, res, next) => {
    newrelic.noticeError(err);
    console.error(`Error in ${req.method} ${req.path}:`, err);
    res.status(500).json({
      error: err.message,
      path: req.path,
      method: req.method,
    });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`HR Portal running on port ${port}`));
}

startHRPortal().catch(console.error);
