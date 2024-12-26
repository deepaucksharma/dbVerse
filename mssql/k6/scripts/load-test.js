import { options } from './lib/config.js';
import { hrOperations } from './scenarios/hr.js';
import { payrollOperations } from './scenarios/payroll.js';
import { performanceOperations } from './scenarios/performance.js';
import { adminOperations } from './scenarios/admin.js';
import http from 'k6/http';
import { check } from 'k6';
import { endpoints } from './lib/config.js';

export { options };

// Health check for all services
export function checkServices() {
    const services = {
        hr: `${endpoints.hr.base}${endpoints.hr.health}`,
        payroll: `${endpoints.payroll.base}${endpoints.payroll.health}`,
        performance: `${endpoints.performance.base}${endpoints.performance.health}`,
        admin: `${endpoints.admin.base}${endpoints.admin.health}`
    };

    for (const [name, url] of Object.entries(services)) {
        const response = http.get(url);
        check(response, {
            [`${name} service is up`]: (r) => r.status === 200,
            [`${name} service db connected`]: (r) => r.json('dbConnected') === true
        });
    }
}

// Export all scenario functions
export { hrOperations };
export { payrollOperations };
export { performanceOperations };
export { adminOperations };
