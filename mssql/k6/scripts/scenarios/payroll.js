import http from 'k6/http';
import { check } from 'k6';
import { endpoints } from '../lib/config.js';
import { randomIntBetween, departmentIds, sleep } from '../lib/utils.js';

export function payrollOperations() {
    // 80% read operations, 20% write operations
    if (Math.random() < 0.8) {
        // Department costs analysis
        const response = http.get(
            `${endpoints.payroll.base}${endpoints.payroll.departmentCosts}`,
            { tags: { endpoint: 'department_costs' } }
        );
        
        check(response, {
            'department costs status is 200': (r) => r.status === 200,
            'costs data structure valid': (r) => {
                const data = r.json();
                return Array.isArray(data) && data.length > 0 &&
                       data[0].DepartmentID !== undefined &&
                       data[0].AnnualPayroll !== undefined;
            }
        });
        
        sleep(1, 3);
    } else {
        // Bulk salary adjustment
        const departmentId = departmentIds[Math.floor(Math.random() * departmentIds.length)];
        const adjustmentPercent = randomIntBetween(-10, 10);  // Conservative adjustment range
        
        const payload = JSON.stringify({
            departmentId,
            adjustmentPercent
        });
        
        const response = http.post(
            `${endpoints.payroll.base}${endpoints.payroll.bulkAdjustment}`,
            payload,
            { 
                headers: { 'Content-Type': 'application/json' },
                tags: { endpoint: 'bulk_adjustment' }
            }
        );
        
        check(response, {
            'salary adjustment status is 200': (r) => r.status === 200,
            'adjustment successfully processed': (r) => r.json('status') === 'success'
        });
        
        sleep(3, 5);  // Longer sleep after write operations
    }
}
