// performance-review/app.js
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

async function startPerformanceReview() {
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
  app.use(requestLogger("Performance-Review"));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // 1. Employee list with performance indicators
  app.get("/perf/employees/list", async (req, res) => {
    newrelic.setTransactionName("performance-review-employee-list");
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
          s.salary,
          DATEDIFF(CURDATE(), e.hire_date) / 365 as years_of_service,
          (SELECT COUNT(DISTINCT title) 
           FROM titles 
           WHERE emp_no = e.emp_no) as role_changes,
          (SELECT MAX(salary) - MIN(salary) 
           FROM salaries 
           WHERE emp_no = e.emp_no) as salary_growth
        FROM employees e
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE t.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
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

  // 2. Career progression analysis
  app.get("/perf/employees/career_progression", async (req, res) => {
    newrelic.setTransactionName("performance-review-career-progression");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          e.emp_no,
          e.first_name,
          e.last_name,
          t1.title as current_title,
          t1.from_date as current_title_date,
          s.salary as current_salary,
          d.dept_name,
          (SELECT title 
           FROM titles t2 
           WHERE t2.emp_no = e.emp_no 
           AND t2.from_date < t1.from_date 
           ORDER BY t2.from_date DESC LIMIT 1) as previous_title,
          (SELECT salary 
           FROM salaries s2 
           WHERE s2.emp_no = e.emp_no 
           AND s2.from_date < s.from_date 
           ORDER BY s2.from_date DESC LIMIT 1) as previous_salary
        FROM employees e
        JOIN titles t1 ON e.emp_no = t1.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        WHERE t1.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // 3. Department performance metrics
  app.get("/perf/departments/avg_score", async (req, res) => {
    newrelic.setTransactionName("performance-review-department-avg-score");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          d.dept_name,
          COUNT(DISTINCT e.emp_no) as employee_count,
          AVG(s.salary) as avg_salary,
          MAX(s.salary) as max_salary,
          MIN(s.salary) as min_salary,
          COUNT(DISTINCT t.title) as title_diversity,
          AVG(DATEDIFF(CURDATE(), e.hire_date)) as avg_tenure_days,
          (SELECT COUNT(DISTINCT emp_no) 
           FROM titles t2 
           WHERE t2.title LIKE 'Senior%' 
           AND t2.emp_no IN (
             SELECT emp_no 
             FROM dept_emp de2 
             WHERE de2.dept_no = d.dept_no 
             AND de2.to_date = '9999-01-01'
           )) as senior_employees
        FROM departments d
        JOIN dept_emp de ON d.dept_no = de.dept_no
        JOIN employees e ON de.emp_no = e.emp_no
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE de.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        GROUP BY d.dept_name
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Employee reviews endpoint
  app.get("/perf/employees/reviews", async (req, res) => {
    newrelic.setTransactionName("performance-review-employee-reviews");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT 
          e.emp_no,
          e.first_name,
          e.last_name,
          t.title,
          s.salary,
          d.dept_name,
          DATEDIFF(CURDATE(), e.hire_date) / 365 as years_of_service,
          (SELECT COUNT(*) 
           FROM titles t2 
           WHERE t2.emp_no = e.emp_no) as role_changes,
          CASE
            WHEN DATEDIFF(CURDATE(), e.hire_date) / 365 >= 15 THEN 'Senior'
            WHEN DATEDIFF(CURDATE(), e.hire_date) / 365 >= 10 THEN 'Experienced'
            WHEN DATEDIFF(CURDATE(), e.hire_date) / 365 >= 5 THEN 'Mid-Level'
            ELSE 'Junior'
          END as experience_level
        FROM employees e
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        JOIN dept_emp de ON e.emp_no = de.emp_no
        JOIN departments d ON de.dept_no = d.dept_no
        WHERE t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        AND de.to_date = '9999-01-01'
        ORDER BY years_of_service DESC
      `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Department performance comparison endpoint
  app.get(
    "/perf/reports/department_performance_comparison",
    async (req, res) => {
      newrelic.setTransactionName("performance-review-department-comparison");
      let connection;
      try {
        connection = await pool.getConnection();
        const [rows] = await connection.query(`
        SELECT 
          d.dept_name,
          COUNT(DISTINCT e.emp_no) as employee_count,
          AVG(s.salary) as avg_salary,
          AVG(DATEDIFF(CURDATE(), e.hire_date) / 365) as avg_years_of_service,
          COUNT(DISTINCT 
            CASE WHEN t.title LIKE 'Senior%' 
                 THEN e.emp_no 
            END
          ) as senior_employee_count,
          (SELECT COUNT(DISTINCT t2.title) 
           FROM titles t2 
           JOIN dept_emp de2 ON t2.emp_no = de2.emp_no 
           WHERE de2.dept_no = d.dept_no) as unique_roles,
          MAX(s.salary) - MIN(s.salary) as salary_range
        FROM departments d
        JOIN dept_emp de ON d.dept_no = de.dept_no
        JOIN employees e ON de.emp_no = e.emp_no
        JOIN titles t ON e.emp_no = t.emp_no
        JOIN salaries s ON e.emp_no = s.emp_no
        WHERE de.to_date = '9999-01-01'
        AND t.to_date = '9999-01-01'
        AND s.to_date = '9999-01-01'
        GROUP BY d.dept_name
        ORDER BY avg_salary DESC
      `);
        res.json({ status: "ok", data: rows });
      } catch (err) {
        newrelic.noticeError(err);
        res.status(500).json({ error: err.message });
      } finally {
        if (connection) connection.release();
      }
    }
  );

  // Add to performance-review/app.js

  // Top performers endpoint
  app.get("/perf/employees/top_performers", async (req, res) => {
    newrelic.setTransactionName("performance-review-top-performers");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
      SELECT 
        e.emp_no,
        e.first_name,
        e.last_name,
        t.title,
        s.salary,
        d.dept_name,
        s.salary - (
          SELECT AVG(s2.salary)
          FROM salaries s2
          JOIN dept_emp de2 ON s2.emp_no = de2.emp_no
          WHERE de2.dept_no = de.dept_no
          AND s2.to_date = '9999-01-01'
        ) as salary_above_dept_avg
      FROM employees e
      JOIN titles t ON e.emp_no = t.emp_no
      JOIN dept_emp de ON e.emp_no = de.emp_no
      JOIN departments d ON de.dept_no = d.dept_no
      JOIN salaries s ON e.emp_no = s.emp_no
      WHERE t.to_date = '9999-01-01'
      AND de.to_date = '9999-01-01'
      AND s.to_date = '9999-01-01'
      HAVING salary_above_dept_avg > 0
      ORDER BY salary_above_dept_avg DESC
    `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Annual performance summary
  app.get("/perf/reports/annual_performance_summary", async (req, res) => {
    newrelic.setTransactionName("performance-review-annual-summary");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
      SELECT 
        YEAR(s.from_date) as year,
        d.dept_name,
        COUNT(DISTINCT e.emp_no) as total_employees,
        AVG(s.salary) as avg_salary,
        COUNT(DISTINCT t.title) as title_count,
        SUM(CASE WHEN t.title LIKE 'Senior%' THEN 1 ELSE 0 END) as senior_positions
      FROM employees e
      JOIN dept_emp de ON e.emp_no = de.emp_no
      JOIN departments d ON de.dept_no = d.dept_no
      JOIN titles t ON e.emp_no = t.emp_no
      JOIN salaries s ON e.emp_no = s.emp_no
      WHERE t.to_date = '9999-01-01'
      AND de.to_date = '9999-01-01'
      AND s.to_date = '9999-01-01'
      GROUP BY YEAR(s.from_date), d.dept_name
      ORDER BY year DESC, d.dept_name
    `);
      res.json({ status: "ok", data: rows });
    } catch (err) {
      newrelic.noticeError(err);
      res.status(500).json({ error: err.message });
    } finally {
      if (connection) connection.release();
    }
  });

  // Search by name and review year
  app.get(
    "/perf/employees/search_by_name_and_review_year",
    async (req, res) => {
      newrelic.setTransactionName("performance-review-search-by-name-year");
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
        d.dept_name,
        s.salary,
        YEAR(e.hire_date) as hire_year,
        (SELECT COUNT(DISTINCT title) 
         FROM titles 
         WHERE emp_no = e.emp_no) as role_changes
      FROM employees e
      JOIN titles t ON e.emp_no = t.emp_no
      JOIN dept_emp de ON e.emp_no = de.emp_no
      JOIN departments d ON de.dept_no = d.dept_no
      JOIN salaries s ON e.emp_no = s.emp_no
      WHERE (e.first_name LIKE '%John%' OR e.last_name LIKE '%Smith%')
      AND YEAR(e.hire_date) = 1990
      AND t.to_date = '9999-01-01'
      AND de.to_date = '9999-01-01'
      AND s.to_date = '9999-01-01'
    `);
        res.json({ status: "ok", data: rows });
      } catch (err) {
        newrelic.noticeError(err);
        res.status(500).json({ error: err.message });
      } finally {
        if (connection) connection.release();
      }
    }
  );
  // search_by_year endpoint
  app.get("/perf/employees/search_by_year", async (req, res) => {
    newrelic.setTransactionName("performance-review-search-by-year");
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`
      SELECT e.emp_no, 
             e.first_name, 
             e.last_name,
             t.title,
             YEAR(e.hire_date) as hire_year,
             COUNT(DISTINCT s.salary) as salary_changes
      FROM employees e
      JOIN titles t ON e.emp_no = t.emp_no
      JOIN salaries s ON e.emp_no = s.emp_no
      WHERE t.to_date = '9999-01-01'
      AND YEAR(e.hire_date) = 1990
      GROUP BY e.emp_no, e.first_name, e.last_name, t.title, YEAR(e.hire_date)
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

  const port = process.env.PORT || 3003;
  app.listen(port, () =>
    console.log(`Performance Review System running on port ${port}`)
  );
}

startPerformanceReview().catch(console.error);
