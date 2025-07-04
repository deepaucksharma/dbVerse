-- Create employees database schema
USE employees;

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
    dept_no     CHAR(4)         NOT NULL,
    dept_name   VARCHAR(40)     NOT NULL,
    PRIMARY KEY (dept_no),
    UNIQUE KEY (dept_name)
) ENGINE=InnoDB;

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
    emp_no      INT             NOT NULL AUTO_INCREMENT,
    birth_date  DATE            NOT NULL,
    first_name  VARCHAR(14)     NOT NULL,
    last_name   VARCHAR(16)     NOT NULL,
    gender      ENUM ('M','F')  NOT NULL,
    hire_date   DATE            NOT NULL,
    PRIMARY KEY (emp_no),
    KEY idx_first_name (first_name),
    KEY idx_last_name (last_name),
    KEY idx_hire_date (hire_date)
) ENGINE=InnoDB;

-- Create dept_emp table
CREATE TABLE IF NOT EXISTS dept_emp (
    emp_no      INT             NOT NULL,
    dept_no     CHAR(4)         NOT NULL,
    from_date   DATE            NOT NULL,
    to_date     DATE            NOT NULL,
    PRIMARY KEY (emp_no,dept_no),
    KEY idx_dept_no (dept_no),
    FOREIGN KEY (emp_no) REFERENCES employees (emp_no) ON DELETE CASCADE,
    FOREIGN KEY (dept_no) REFERENCES departments (dept_no) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create dept_manager table
CREATE TABLE IF NOT EXISTS dept_manager (
    emp_no       INT             NOT NULL,
    dept_no      CHAR(4)         NOT NULL,
    from_date    DATE            NOT NULL,
    to_date      DATE            NOT NULL,
    PRIMARY KEY (emp_no,dept_no),
    KEY idx_dept_no (dept_no),
    FOREIGN KEY (emp_no) REFERENCES employees (emp_no) ON DELETE CASCADE,
    FOREIGN KEY (dept_no) REFERENCES departments (dept_no) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create titles table
CREATE TABLE IF NOT EXISTS titles (
    emp_no      INT             NOT NULL,
    title       VARCHAR(50)     NOT NULL,
    from_date   DATE            NOT NULL,
    to_date     DATE,
    PRIMARY KEY (emp_no,title,from_date),
    FOREIGN KEY (emp_no) REFERENCES employees (emp_no) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create salaries table
CREATE TABLE IF NOT EXISTS salaries (
    emp_no      INT             NOT NULL,
    salary      INT             NOT NULL,
    from_date   DATE            NOT NULL,
    to_date     DATE            NOT NULL,
    PRIMARY KEY (emp_no, from_date),
    FOREIGN KEY (emp_no) REFERENCES employees (emp_no) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create performance_reviews table
CREATE TABLE IF NOT EXISTS performance_reviews (
    review_id           INT             NOT NULL AUTO_INCREMENT,
    emp_no              INT             NOT NULL,
    review_date         DATE            NOT NULL,
    reviewer_emp_no     INT             NOT NULL,
    rating              DECIMAL(3,2)    NOT NULL,
    comments            TEXT,
    goals               TEXT,
    achievements        TEXT,
    improvement_areas   TEXT,
    next_review_date    DATE,
    PRIMARY KEY (review_id),
    KEY idx_emp_no (emp_no),
    KEY idx_review_date (review_date),
    KEY idx_reviewer (reviewer_emp_no),
    FOREIGN KEY (emp_no) REFERENCES employees (emp_no) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_emp_no) REFERENCES employees (emp_no)
) ENGINE=InnoDB;

-- Create payroll table
CREATE TABLE IF NOT EXISTS payroll (
    payroll_id          INT             NOT NULL AUTO_INCREMENT,
    emp_no              INT             NOT NULL,
    pay_date            DATE            NOT NULL,
    basic_salary        DECIMAL(10,2)   NOT NULL,
    allowances          DECIMAL(10,2)   DEFAULT 0,
    deductions          DECIMAL(10,2)   DEFAULT 0,
    net_pay             DECIMAL(10,2)   NOT NULL,
    pay_period_start    DATE            NOT NULL,
    pay_period_end      DATE            NOT NULL,
    payment_method      VARCHAR(50),
    status              VARCHAR(20)     DEFAULT 'PENDING',
    PRIMARY KEY (payroll_id),
    KEY idx_emp_no (emp_no),
    KEY idx_pay_date (pay_date),
    KEY idx_status (status),
    FOREIGN KEY (emp_no) REFERENCES employees (emp_no) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create indexes for better performance
CREATE INDEX idx_dept_emp_dates ON dept_emp (from_date, to_date);
CREATE INDEX idx_dept_mgr_dates ON dept_manager (from_date, to_date);
CREATE INDEX idx_salaries_dates ON salaries (from_date, to_date);
CREATE INDEX idx_titles_dates ON titles (from_date, to_date);