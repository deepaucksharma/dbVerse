'use strict';

module.exports = {
    getConfig: (appName) => ({
        app_name: [appName],
        license_key: process.env.NEW_RELIC_LICENSE_KEY,
        logging: {
            level: 'info'
        },
        allow_all_headers: true,
        distributed_tracing: {
            enabled: true
        },
        transaction_tracer: {
            enabled: true,
            record_sql: 'raw',
            explain_threshold: 500
        },
        slow_sql: {
            enabled: true,
            max_samples: 10
        }
    })
};
