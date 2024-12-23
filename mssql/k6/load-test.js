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

const BASE_URLS = {
  HR_PORTAL: __ENV.HR_PORTAL_URL || 'http://hr-portal:3000',
  PAYROLL: __ENV.PAYROLL_SYSTEM_URL || 'http://payroll-system:3001',
  PERFORMANCE: __ENV.PERFORMANCE_REVIEW_URL || 'http://performance-review:3002',
  ADMIN: __ENV.ADMIN_CONSOLE_URL || 'http://admin-console:3003'
};

function makeRequest(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint.path}`;
  const params = {
    headers: { 'Content-Type': 'application/json' }
  };
  let response;

  try {
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
    console.error(`Error on ${url}: ${err}`);
    sleep(2);
  }
}

// HR Portal
export function hrPortal() {
  const endpoints = [
    { path: '/hr/employees/search', method: 'GET' },
    // etc.
  ];
  const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
  makeRequest(BASE_URLS.HR_PORTAL, ep);
}

// Payroll
export function payrollSystem() {
  const endpoints = [
    { path: '/payroll/sales/commission', method: 'GET' },
    // etc.
  ];
  const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
  makeRequest(BASE_URLS.PAYROLL, ep);
}

// Performance
export function performanceReview() {
  const endpoints = [
    { path: '/perf/employees/list', method: 'GET' },
    // etc.
  ];
  makeRequest(BASE_URLS.PERFORMANCE, endpoints[Math.floor(Math.random() * endpoints.length)]);
}

// Admin
export function adminConsole() {
  const endpoints = [
    { path: '/admin/employees/search', method: 'GET' },
    // etc.
  ];
  makeRequest(BASE_URLS.ADMIN, endpoints[Math.floor(Math.random() * endpoints.length)]);
}
