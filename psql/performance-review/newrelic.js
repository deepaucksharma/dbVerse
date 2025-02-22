'use strict';

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME_PERFORMANCE],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  
  distributed_tracing: {
    enabled: true
  },

  transaction_tracer: {
    record_sql: 'raw',
    explain_threshold: 500,
    top_n: 20
  },

  slow_sql: {
    enabled: true,
    max_samples: 10
  },

  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || 'info',
    filepath: process.env.NEW_RELIC_LOG || 'stdout'
  },

  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
      max_samples_stored: 10000
    },
    metrics: {
      enabled: true
    },
    local_decorating: {
      enabled: true
    }
  },

  browser_monitoring: {
    enable: true
  },

  datastore_tracer: {
    instance_reporting: {
      enabled: true
    },
    database_name_reporting: {
      enabled: true
    }
  }
};
