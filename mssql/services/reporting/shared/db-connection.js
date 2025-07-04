const sql = require('mssql');

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_HOST,
  port: parseInt(process.env.MSSQL_PORT) || 1433,
  database: process.env.MSSQL_DB,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool;

async function connect() {
  try {
    pool = await sql.connect(config);
    console.log('Connected to MSSQL database');
    return pool;
  } catch (err) {
    console.error('Database connection failed:', err);
    throw err;
  }
}

async function getPool() {
  if (!pool) {
    await connect();
  }
  return pool;
}

module.exports = {
  connect,
  getPool,
  sql
};