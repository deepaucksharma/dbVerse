-- Insert sample data into departments
INSERT INTO departments (dept_no, dept_name) VALUES
('d001', 'Marketing'),
('d002', 'Finance'),
('d003', 'Human Resources'),
('d004', 'Production'),
('d005', 'Development'),
('d006', 'Quality Management'),
('d007', 'Sales'),
('d008', 'Research'),
('d009', 'Customer Service');

-- Insert sample employees
INSERT INTO employees (emp_no, birth_date, first_name, last_name, gender, hire_date) VALUES
(10001, '1953-09-02', 'Georgi', 'Facello', 'M', '1986-06-26'),
(10002, '1964-06-02', 'Bezalel', 'Simmel', 'F', '1985-11-21'),
(10003, '1959-12-03', 'Parto', 'Bamford', 'M', '1986-08-28'),
(10004, '1954-05-01', 'Chirstian', 'Koblick', 'M', '1986-12-01'),
(10005, '1955-01-21', 'Kyoichi', 'Maliniak', 'M', '1989-09-12'),
(10006, '1953-04-20', 'Anneke', 'Preusig', 'F', '1989-06-02'),
(10007, '1957-05-23', 'Tzvetan', 'Zielinski', 'F', '1989-02-10'),
(10008, '1958-02-19', 'Saniya', 'Kalloufi', 'M', '1994-09-15'),
(10009, '1952-04-19', 'Sumant', 'Peac', 'F', '1985-02-18'),
(10010, '1963-06-01', 'Duangkaew', 'Piveteau', 'F', '1989-08-24');

-- Insert department employee relationships
INSERT INTO dept_emp (emp_no, dept_no, from_date, to_date) VALUES
(10001, 'd005', '1986-06-26', '9999-01-01'),
(10002, 'd007', '1996-08-03', '9999-01-01'),
(10003, 'd004', '1995-12-03', '9999-01-01'),
(10004, 'd004', '1986-12-01', '9999-01-01'),
(10005, 'd003', '1989-09-12', '9999-01-01'),
(10006, 'd005', '1990-08-05', '9999-01-01'),
(10007, 'd008', '1989-02-10', '9999-01-01'),
(10008, 'd005', '1998-03-11', '9999-01-01'),
(10009, 'd006', '1985-02-18', '9999-01-01'),
(10010, 'd004', '1996-11-24', '9999-01-01');

-- Insert department managers
INSERT INTO dept_manager (emp_no, dept_no, from_date, to_date) VALUES
(10001, 'd005', '1991-10-01', '9999-01-01'),
(10002, 'd007', '1991-03-07', '9999-01-01'),
(10003, 'd004', '1992-04-08', '9999-01-01'),
(10005, 'd003', '1994-09-12', '9999-01-01');

-- Insert titles
INSERT INTO titles (emp_no, title, from_date, to_date) VALUES
(10001, 'Senior Engineer', '1986-06-26', '9999-01-01'),
(10002, 'Staff', '1996-08-03', '9999-01-01'),
(10003, 'Senior Engineer', '1995-12-03', '9999-01-01'),
(10004, 'Engineer', '1986-12-01', '1995-12-01'),
(10004, 'Senior Engineer', '1995-12-01', '9999-01-01'),
(10005, 'Senior Staff', '1996-09-12', '9999-01-01'),
(10006, 'Senior Engineer', '1990-08-05', '9999-01-01'),
(10007, 'Senior Staff', '1996-02-11', '9999-01-01'),
(10008, 'Assistant Engineer', '1998-03-11', '2000-07-31'),
(10009, 'Assistant Engineer', '1985-02-18', '1990-02-18'),
(10010, 'Engineer', '1996-11-24', '9999-01-01');

-- Insert salaries
INSERT INTO salaries (emp_no, salary, from_date, to_date) VALUES
(10001, 85000, '2023-06-26', '9999-01-01'),
(10002, 72000, '2023-08-03', '9999-01-01'),
(10003, 78000, '2023-12-03', '9999-01-01'),
(10004, 67000, '2023-12-01', '9999-01-01'),
(10005, 89000, '2023-09-12', '9999-01-01'),
(10006, 82000, '2023-08-05', '9999-01-01'),
(10007, 88000, '2023-02-11', '9999-01-01'),
(10008, 56000, '2023-03-11', '9999-01-01'),
(10009, 54000, '2023-02-18', '9999-01-01'),
(10010, 65000, '2023-11-24', '9999-01-01');

-- Insert performance reviews
INSERT INTO performance_reviews (emp_no, review_date, reviewer_emp_no, rating, comments, goals, achievements, improvement_areas, next_review_date) VALUES
(10001, '2023-12-15', 10002, 4.5, 'Excellent performance throughout the year', 'Lead major projects', 'Successfully delivered 3 major features', 'None', '2024-12-15'),
(10003, '2023-12-15', 10001, 4.0, 'Good work on production systems', 'Improve automation', 'Reduced downtime by 30%', 'Documentation skills', '2024-12-15'),
(10004, '2023-12-15', 10003, 3.8, 'Solid contributor to the team', 'Learn new technologies', 'Completed all assigned tasks', 'Time management', '2024-12-15'),
(10006, '2023-12-15', 10001, 4.2, 'Strong technical skills', 'Mentor junior developers', 'Helped onboard 2 new team members', 'None', '2024-12-15'),
(10008, '2023-12-15', 10001, 3.5, 'Meeting expectations', 'Improve coding skills', 'Learned React framework', 'Communication', '2024-12-15');

-- Insert payroll records
INSERT INTO payroll (emp_no, pay_date, basic_salary, allowances, deductions, net_pay, pay_period_start, pay_period_end, payment_method, status) VALUES
(10001, '2023-12-31', 7083.33, 500, 800, 6783.33, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10002, '2023-12-31', 6000.00, 400, 700, 5700.00, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10003, '2023-12-31', 6500.00, 450, 750, 6200.00, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10004, '2023-12-31', 5583.33, 300, 650, 5233.33, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10005, '2023-12-31', 7416.67, 550, 850, 7116.67, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10006, '2023-12-31', 6833.33, 500, 780, 6553.33, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10007, '2023-12-31', 7333.33, 520, 830, 7023.33, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10008, '2023-12-31', 4666.67, 250, 550, 4366.67, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10009, '2023-12-31', 4500.00, 200, 520, 4180.00, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID'),
(10010, '2023-12-31', 5416.67, 350, 620, 5146.67, '2023-12-01', '2023-12-31', 'Bank Transfer', 'PAID');