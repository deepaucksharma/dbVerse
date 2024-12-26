import http from 'k6/http';
import { check } from 'k6';
import { endpoints } from '../lib/config.js';
import { randomIntBetween, sleep } from '../lib/utils.js';

export function adminOperations() {
    if (Math.random() < 0.7) {
        const response = http.get(`${endpoints.admin.base}${endpoints.admin.orgHierarchy}`);
        check(response, {
            'org hierarchy status is 200': (r) => r.status === 200,
            'hierarchy has data': (r) => Array.isArray(r.json())
        });
    } else {
        let sourceDeptId = randomIntBetween(1, 7);
        let targetDeptId;
        do {
            targetDeptId = randomIntBetween(1, 7);
        } while (targetDeptId === sourceDeptId);

        const payload = JSON.stringify({ sourceDeptId, targetDeptId });
        
        const response = http.post(
            `${endpoints.admin.base}${endpoints.admin.bulkTransfer}`,
            payload,
            { headers: { 'Content-Type': 'application/json' } }
        );
        
        check(response, {
            'department transfer status is 200': (r) => r.status === 200,
            'transfer successful': (r) => r.json('status') === 'success'
        });
    }
    
    sleep(3, 5);
}
