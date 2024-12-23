'use strict';

exports.config = {
  app_name: ['Payroll-System'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: {
    enabled: true
  },
  transaction_tracer: {
    record_sql: 'raw',
    explain_threshold: 500
  },
  slow_sql: {
    enabled: true,
    max_samples: 10
  },
  logging: {
    level: 'info'
  }
};
