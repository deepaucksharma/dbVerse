import http from 'k6/http';
import { check } from 'k6';
import { endpoints } from '../lib/config.js';
import { randomIntBetween, departmentIds, sleep } from '../lib/utils.js';

export function performanceOperations() {
    // 50/50 split between employee and department metrics
    if (Math.random() < 0.5) {
        // Employee analysis with optional department filter
        const useDepartmentFilter = Math.random() < 0.3;
        const queryString = useDepartmentFilter 
            ? `?departmentId=${departmentIds[Math.floor(Math.random() * departmentIds.length)]}` 
            : '';
            
        const response = http.get(
            `${endpoints.performance.base}${endpoints.performance.employeeAnalysis}${queryString}`,
            { tags: { endpoint: 'employee_analysis' } }
        );
        
        check(response, {
            'employee analysis status is 200': (r) => r.status === 200,
            'employee metrics data valid': (r) => {
                const data = r.json();
                return Array.isArray(data) && data.length > 0 &&
                       data[0].BusinessEntityID !== undefined &&
                       data[0].DepartmentName !== undefined;
            }
        });
    } else {
        // Department metrics
        const response = http.get(
            `${endpoints.performance.base}${endpoints.performance.departmentMetrics}`,
            { tags: { endpoint: 'department_metrics' } }
        );
        
        check(response, {
            'department metrics status is 200': (r) => r.status === 200,
            'department metrics data valid': (r) => {
                const data = r.json();
                return Array.isArray(data) && data.length > 0 &&
                       data[0].DepartmentID !== undefined &&
                       data[0].EmployeeCount !== undefined;
            }
        });
    }

    sleep(2, 4);
}
