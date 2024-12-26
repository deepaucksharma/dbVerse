export const options = {
    scenarios: {
        startup_check: {
            executor: 'shared-iterations',
            vus: 1,
            iterations: 1,
            exec: 'checkServices'
        },
        hr_portal: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 5 },
                { duration: '3m', target: 5 },
                { duration: '1m', target: 0 }
            ],
            exec: 'hrOperations',
            startTime: '2m'
        },
        payroll_system: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 3 },
                { duration: '3m', target: 3 },
                { duration: '1m', target: 0 }
            ],
            exec: 'payrollOperations',
            startTime: '2m'
        },
        performance_review: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 3 },
                { duration: '3m', target: 3 },
                { duration: '1m', target: 0 }
            ],
            exec: 'performanceOperations',
            startTime: '2m'
        },
        admin_console: {
            executor: 'ramping-arrival-rate',
            startRate: 1,
            timeUnit: '1m',
            preAllocatedVUs: 2,
            maxVUs: 4,
            stages: [
                { duration: '2m', target: 2 },
                { duration: '3m', target: 2 },
                { duration: '1m', target: 0 }
            ],
            exec: 'adminOperations',
            startTime: '7m'
        }
    },
    thresholds: {
        http_req_duration: ['p(95)<15000'],
        'http_req_duration{scenario:hr_portal}': ['p(95)<5000'],
        'http_req_duration{scenario:payroll_system}': ['p(95)<10000'],
        'http_req_duration{scenario:performance_review}': ['p(95)<12000'],
        'http_req_duration{scenario:admin_console}': ['p(95)<15000']
    }
};

export const endpoints = {
    hr: {
        base: __ENV.HR_PORTAL_URL || 'http://hr:3000',
        health: '/health',
        employeeSearch: '/hr/employees/search'
    },
    payroll: {
        base: __ENV.PAYROLL_SYSTEM_URL || 'http://payroll:3000',
        health: '/health',
        departmentCosts: '/payroll/department-costs',
        bulkAdjustment: '/payroll/bulk-adjustment'
    },
    performance: {
        base: __ENV.PERFORMANCE_REVIEW_URL || 'http://performance:3000',
        health: '/health',
        employeeAnalysis: '/performance/employee-analysis',
        departmentMetrics: '/performance/department-metrics'
    },
    admin: {
        base: __ENV.ADMIN_CONSOLE_URL || 'http://admin:3000',
        health: '/health',
        orgHierarchy: '/admin/org-hierarchy',
        bulkTransfer: '/admin/bulk-department-transfer'
    }
};
