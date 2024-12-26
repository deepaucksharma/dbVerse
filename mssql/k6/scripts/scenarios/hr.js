import http from 'k6/http';
import { check } from 'k6';
import { endpoints } from '../lib/config.js';
import { searchQueries, sleep } from '../lib/utils.js';

export function hrOperations() {
    // Randomly select a search query
    const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
    
    // Build query string
    const queryString = new URLSearchParams({
        name: query.name,
        department: query.department,
        page: Math.floor(Math.random() * 3) + 1,  // Random page 1-3
        pageSize: 20
    }).toString();
    
    const response = http.get(
        `${endpoints.hr.base}${endpoints.hr.employeeSearch}?${queryString}`,
        { tags: { endpoint: 'employee_search' } }
    );
    
    check(response, {
        'employee search status is 200': (r) => r.status === 200,
        'employee search has results': (r) => Array.isArray(r.json('employees')),
        'pagination info present': (r) => r.json('pagination') !== undefined,
    });

    sleep(1, 3);
}
