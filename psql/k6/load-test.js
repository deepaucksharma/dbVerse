// k6/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'k6/crypto';

export const options = {
  scenarios: {
    hr_portal: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 8 },
        { duration: '5m', target: 8 },
        { duration: '2m', target: 0 }
      ],
      exec: 'hrPortal'
    },
    payroll_system: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 6 },
        { duration: '5m', target: 6 },
        { duration: '2m', target: 0 }
      ],
      exec: 'payrollSystem'
    },
    reporting_dashboard: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '2m', target: 0 }
      ],
      exec: 'reportingDashboard'
    },
    performance_review: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 4 },
        { duration: '5m', target: 4 },
        { duration: '2m', target: 0 }
      ],
      exec: 'performanceReview'
    },
    admin_console: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 2 },
        { duration: '5m', target: 2 },
        { duration: '2m', target: 0 }
      ],
      exec: 'adminConsole'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<8000'] // 8s for 95th percentile
  }
};

if (!__ENV.HR_PORTAL_URL) throw new Error('HR_PORTAL_URL environment variable is required');
if (!__ENV.PAYROLL_SYSTEM_URL) throw new Error('PAYROLL_SYSTEM_URL environment variable is required');
if (!__ENV.REPORTING_DASHBOARD_URL) throw new Error('REPORTING_DASHBOARD_URL environment variable is required');
if (!__ENV.PERFORMANCE_REVIEW_URL) throw new Error('PERFORMANCE_REVIEW_URL environment variable is required');
if (!__ENV.ADMIN_CONSOLE_URL) throw new Error('ADMIN_CONSOLE_URL environment variable is required');

const BASE_URLS = {
  HR_PORTAL: __ENV.HR_PORTAL_URL,
  PAYROLL: __ENV.PAYROLL_SYSTEM_URL,
  REPORTING: __ENV.REPORTING_DASHBOARD_URL,
  PERFORMANCE: __ENV.PERFORMANCE_REVIEW_URL,
  ADMIN: __ENV.ADMIN_CONSOLE_URL
};

function makeRequest(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint.path}`;
  const params = {
    headers: { 'Content-Type': 'application/json' }
  };

  try {
    let response;
    switch (endpoint.method.toUpperCase()) {
      case 'GET':
        response = http.get(url, params);
        break;
      case 'POST':
        response = http.post(url, JSON.stringify(endpoint.body || {}), params);
        break;
      case 'PUT':
        response = http.put(url, JSON.stringify(endpoint.body || {}), params);
        break;
      default:
        return;
    }

    check(response, {
      'status was 200': (r) => r.status === 200
    });

    sleep(randomIntBetween(1, 3));
  } catch (err) {
    console.error(`Error making request to ${url}:`, err);
    sleep(2);
  }
}

// HR Portal endpoints
export function hrPortal() {
  const endpoints = [
    { path: '/hr/employees/search', method: 'GET' },
    { path: '/hr/employees/list', method: 'GET' },
    { path: '/hr/employees/search_by_name_or_dept', method: 'GET' },
    { path: '/hr/employees/transfer', method: 'POST' }
  ];
  makeRequest(BASE_URLS.HR_PORTAL, endpoints[Math.floor(Math.random() * endpoints.length)]);
}

// Payroll System endpoints
export function payrollSystem() {
  const endpoints = [
    { path: '/payroll/salaries/by_employee', method: 'GET' },
    { path: '/payroll/salaries/by_range', method: 'GET' },
    { path: '/payroll/salaries/adjust', method: 'PUT' },
    // The following is an unimplemented example:
    { path: '/payroll/employees/list_by_salary', method: 'GET' },
    { path: '/payroll/reports/highest_earners', method: 'GET' },
    { path: '/payroll/employees/high_connection_load', method: 'GET' }
  ];
  makeRequest(BASE_URLS.PAYROLL, endpoints[Math.floor(Math.random() * endpoints.length)]);
}

// Reporting Dashboard endpoints
export function reportingDashboard() {
  const endpoints = [
    { path: '/reports/employees/list_all', method: 'GET' },
    { path: '/reports/departments/average_salary', method: 'GET' },
    { path: '/reports/employees/long_tenure', method: 'GET' },
    { path: '/reports/salaries/highest_by_dept', method: 'GET' },
    { path: '/reports/employees/concurrent_report_generation', method: 'GET' }
  ];
  makeRequest(BASE_URLS.REPORTING, endpoints[Math.floor(Math.random() * endpoints.length)]);
}

// Performance Review endpoints
export function performanceReview() {
  const endpoints = [
    { path: '/perf/employees/list', method: 'GET' },
    { path: '/perf/employees/career_progression', method: 'GET' },
    { path: '/perf/departments/avg_score', method: 'GET' },
    { path: '/perf/employees/top_performers', method: 'GET' },
    { path: '/perf/reports/annual_performance_summary', method: 'GET' }
  ];
  makeRequest(BASE_URLS.PERFORMANCE, endpoints[Math.floor(Math.random() * endpoints.length)]);
}

// Admin Console endpoints
export function adminConsole() {
  const endpoints = [
    { path: '/admin/employees/search', method: 'GET' },
    { path: '/admin/employees/bulk_title_update', method: 'PUT' },
    { path: '/admin/departments/details', method: 'GET' },
    // Missing :id for /admin/employees/details/:id but here for demo
    { path: '/admin/employees/details', method: 'GET' },
    { path: '/admin/employees/data_export', method: 'GET' }
  ];
  makeRequest(BASE_URLS.ADMIN, endpoints[Math.floor(Math.random() * endpoints.length)]);
}
