
# PostgreSQL Performance Monitoring Environment

This repository provides a **multi-service** containerized environment for **db performance monitoring** on a PostgreSQL 15 database. It leverages advanced monitoring extensions and integrates with **New Relic** for real-time performance insights. Several Node.js microservices (HR portal, Payroll, Admin Console, etc.) simulate various workloads against the database, and a **k6** script generates load to test the system under stress.

---

## 1.  Overview


### 1.1 Quick Start Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-org/db-perf-env.git
   cd db-perf-env/psql
   ```
2. **Configure environment**:
   - Copy or edit the `.env` file to set `POSTGRES_PASSWORD`, `NEW_RELIC_LICENSE_KEY`, etc.
   - (Optional) Place `employees_data.sql(.bz2)` in `postgres/init-scripts/` if you want the sample data.
3. **Build & Run**:
   ```bash
   docker-compose build
   docker-compose up -d
   ```
4. **Check service availability**:
   - `docker-compose ps`
   - `curl http://localhost:3000/health` (HR Portal)
   - `curl http://localhost:3004/health` (Admin Console), etc.
5. **Run k6 tests** (automatically runs on container start if you don’t override the command). Or attach logs:
   ```bash
   docker-compose logs -f k6
   ```
6. **Verify New Relic**:
   - In your New Relic dashboard, check for services: “HR-Portal,” “Payroll-System,” etc.
   - The Postgres integration will appear under Infrastructure -> Integrations.

---

### 1.2 Troubleshooting

1. **Container fails to start**:
   - Check Postgres logs: `docker-compose logs postgres-db`
   - Make sure you’re not hitting memory or disk constraints.

2. **Services can’t connect to DB**:
   - Confirm `POSTGRES_HOST=postgres-db` in each microservice.  
   - Verify the `postgres-db` container is healthy.

3. **No data imported**:
   - Ensure `employees_data.sql` or `.bz2` was placed correctly in `postgres/init-scripts/`.
   - Check logs from `02-setup-db.sh` for errors or warnings.

4. **New Relic agent not reporting**:
   - Confirm `NEW_RELIC_LICENSE_KEY` is set in `.env`.
   - Check the logs under `/var/log/newrelic-infra/agent.log` inside the `postgres-db` container.


---


### 1.3 High-Level Components

1. **Postgres 15** (Docker image built from `postgres:15-bullseye`)  
   - Extensions (pinned versions):
     - **pg_stat_monitor** v2.1.0 (Percona)
     - **pg_wait_sampling** v1.1.6
     - **pg_stat_statements** (bundled with PG 15)
     - **pgcrypto** (core Postgres extension)
   - Customized `postgresql.conf`, `pg_hba.conf`
   - Automated init scripts for dynamic memory config, schema creation, optional data import, and final checks

2. **Node.js Microservices** (each has its own Dockerfile):
   - **Admin Console** (`admin-console`)
   - **HR Portal** (`hr-portal`)
   - **Payroll System** (`payroll-system`)
   - **Performance Review** (`performance-review`)
   - **Reporting Dashboard** (`reporting-dashboard`)

3. **Load Testing** (`k6`)  
   - A single container (`grafana/k6`) runs `load-test.js` scenarios against the microservices.

4. **New Relic Monitoring**  
   - Infrastructure agent (installed in the Postgres container)
   - Each Node.js service includes `newrelic` agent with transaction tracing and slow SQL capture.
   - `nri-postgresql` built from branch `queryAnalysisTestingV8` for DB telemetry.

5. **Docker Compose** orchestration:
   - Stands up Postgres + 5 microservices + k6 loader

---

## 2. Repository Layout

```
db-perf-env/
└── psql/
    ├── admin-console/
    │   ├── Dockerfile
    │   ├── app.js
    │   ├── newrelic.js
    │   └── package.json
    ├── hr-portal/
    │   ├── Dockerfile
    │   ├── app.js
    │   ├── newrelic.js
    │   └── package.json
    ├── payroll-system/
    │   ├── Dockerfile
    │   ├── app.js
    │   ├── newrelic.js
    │   └── package.json
    ├── performance-review/
    │   ├── Dockerfile
    │   ├── app.js
    │   ├── newrelic.js
    │   └── package.json
    ├── reporting-dashboard/
    │   ├── Dockerfile
    │   ├── app.js
    │   ├── newrelic.js
    │   └── package.json
    ├── k6/
    │   └── load-test.js
    ├── postgres/
    │   ├── config/
    │   │   ├── newrelic-postgres-integration.yml
    │   │   ├── pg_hba.conf
    │   │   └── postgresql.conf
    │   ├── init-scripts/
    │   │   ├── 00-configure-memory.sh
    │   │   ├── 00-initdb.sql
    │   │   ├── 01-verify-init.sh
    │   │   ├── 02-setup-db.sh
    │   │   └── 99-post-init.sh
    │   ├── scripts/
    │   │   ├── start.sh
    │   │   └── verify-extensions.sh
    │   ├── Dockerfile
    ├── docker-compose.yml
    └── .env
```

---

## 3. PostgreSQL Container

### 3.1 Dockerfile Highlights
- **Multi-Stage Build**:
  1. **Builder-Go** (golang:1.23-bullseye): Compiles `nri-postgresql`.
  2. **Extensions-builder** (postgres:15-bullseye): Clones and builds pinned versions of `pg_stat_monitor` (v2.1.0) and `pg_wait_sampling` (v1.1.6).
  3. **init-processor**: Pre-processes any `employees_data.sql(.bz2)` if present.
  4. **Final Image**: 
     - Copies all built assets, config, scripts.
     - Installs New Relic Infra agent (v1.58.1).
     - Includes healthcheck and environment variables for Postgres.

### 3.2 Key Postgres Features

- **Extensions**:
  - `pg_stat_monitor` v2.1.0
  - `pg_wait_sampling` v1.1.6
  - `pg_stat_statements`
  - `pgcrypto`

- **Configuration** (`postgresql.conf`):
  - `shared_preload_libraries = 'pg_stat_statements, pg_wait_sampling, pg_stat_monitor'`
  - Example defaults: `shared_buffers = '1GB'`, `work_mem = '16MB'`, `maintenance_work_mem = '128MB'`
  - `log_min_duration_statement = 1000` to log queries over 1s

- **Init Scripts**:
  1. **00-configure-memory.sh**: Currently commented out dynamic logic.  
  2. **00-initdb.sql**: Creates schema `employees`, sets up extensions.  
  3. **01-verify-init.sh**: Double-checks extension loading.  
  4. **02-setup-db.sh**: Optionally imports the employees data if found.  
  5. **99-post-init.sh**: Waits for PG readiness and verifies New Relic agent.

- **Optional Data Import**:
  - If `employees_data.sql` or `.bz2` is detected, it’s imported into the `employees` schema. 
  - The script uses basic checks for file size, line count, and disk space.

---

## 4. Node.js Microservices

### Common Patterns
- Each service:
  - Uses **Node 18 (alpine)** for a lightweight image.
  - `newrelic.js` config references `NEW_RELIC_LICENSE_KEY`.
  - `app.js` sets up:
    - A `Pool` from `pg` with environment-based credentials.
    - A `/health` endpoint for container health checks.
    - Various domain-specific routes.

### 4.1 Admin Console (`admin-console/`)
- Port: **3004** by default
- Endpoints for advanced admin operations:
  - `/admin/employees/search` (Complex multi-table query)
  - `/admin/employees/bulk_title_update` (Transaction-based bulk update)
  - `/admin/departments/details` (Department-level stats)
  - `/admin/employees/details/:id` (Employee detail + history)
  - `/admin/employees/data_export` (Dump basic employee info)

### 4.2 HR Portal (`hr-portal/`)
- Port: **3000** by default
- Endpoints handle employee list, search, and department transfers:
  - `/hr/employees/search`
  - `/hr/employees/search_by_name_or_dept`
  - `/hr/employees/list`
  - `/hr/employees/transfer`
  - `/hr/employees/update_salary`

### 4.3 Payroll System (`payroll-system/`)
- Port: **3001** by default
- Endpoints revolve around salaries and pay adjustments:
  - `/payroll/salaries/by_employee`
  - `/payroll/salaries/by_range`
  - `/payroll/salaries/adjust`
  - `/payroll/employees/high_connection_load`
  - `/payroll/reports/highest_earners`

### 4.4 Performance Review (`performance-review/`)
- Port: **3003** by default
- Provides performance analytics:
  - `/perf/employees/list`
  - `/perf/employees/career_progression`
  - `/perf/departments/avg_score`
  - `/perf/employees/top_performers`
  - `/perf/reports/annual_performance_summary`

### 4.5 Reporting Dashboard (`reporting-dashboard/`)
- Port: **3002** by default
- Offers data-heavy queries:
  - `/reports/employees/list_all`
  - `/reports/departments/average_salary`
  - `/reports/employees/long_tenure`
  - `/reports/salaries/highest_by_dept`
  - `/reports/employees/concurrent_report_generation`

---

## 5. Load Testing with k6

- **k6** container uses the official `grafana/k6` image.
- The `load-test.js` script runs multiple scenarios concurrently:
  - `hrPortal()`, `payrollSystem()`, `reportingDashboard()`, `performanceReview()`, `adminConsole()`
- Each scenario hits random endpoints in the respective service.
- Tuning the load test: Adjust `scenarios` in `load-test.js` (VU count, duration, etc.).

---

## 6. Docker Compose Setup

### 6.1 `.env` Variables
A sample `.env` (located in `psql/.env`) includes:
```
# PostgreSQL credentials
POSTGRES_USER=postgres
POSTGRES_PASSWORD=pass
POSTGRES_DB=employees
POSTGRES_SCHEMA=employees

NEW_RELIC_LICENSE_KEY=your_license_key
NR_POSTGRES_PASSWORD=your_secure_password_here

HR_PORTAL_PORT=3000
PAYROLL_SYSTEM_PORT=3001
REPORTING_DASHBOARD_PORT=3002
PERFORMANCE_REVIEW_PORT=3003
ADMIN_CONSOLE_PORT=3004

HR_PORTAL_URL=http://hr-portal:3000
PAYROLL_SYSTEM_URL=http://payroll-system:3001
REPORTING_DASHBOARD_URL=http://reporting-dashboard:3002
PERFORMANCE_REVIEW_URL=http://performance-review:3003
ADMIN_CONSOLE_URL=http://admin-console:3004
```

### 6.2 `docker-compose.yml`
- Stands up:
  - **postgres-db**: Builds from the `postgres/` Dockerfile
  - **hr-portal**: Node app
  - **payroll-system**
  - **reporting-dashboard**
  - **performance-review**
  - **admin-console**
  - **k6**: Orchestrates load tests
- Each service has a `healthcheck`, environment variables, memory limits, etc.
- **Volumes**: `postgres-data` persists Postgres data.

**To start**:
```bash
docker-compose up -d
```
Then you can view logs with:
```bash
docker-compose logs -f
```

---

## Final Notes

This environment is designed for **demonstration** and **local testing** of complex Postgres performance scenarios. The included microservices, each with their own Dockerfiles, replicate real-world data interactions. The advanced monitoring via **pg_stat_monitor**, **pg_wait_sampling**, and **New Relic** helps you identify bottlenecks and tune Postgres effectively. 

