import sql from 'mssql';

class DatabaseConnection {
    constructor(config) {
        this.config = config;
        this.pool = null;
        this.poolReady = false;
        this.maxRetries = parseInt(process.env.DB_CONNECTION_RETRIES) || 10;
        this.baseDelay = parseInt(process.env.DB_RETRY_BASE_DELAY) || 5000;
        this.maxDelay = parseInt(process.env.DB_RETRY_MAX_DELAY) || 30000;
    }

    async verifyConnection() {
        try {
            if (!this.pool) {
                return false;
            }
            const result = await this.pool.request().query('SELECT @@version as version');
            return result.recordset.length > 0;
        } catch (err) {
            console.error('Connection verification failed:', err);
            return false;
        }
    }

    async connect() {
        let attempts = 0;

        while (!this.poolReady && attempts < this.maxRetries) {
            try {
                if (this.pool) {
                    try {
                        await this.pool.close();
                    } catch (err) {
                        console.warn('Error closing existing pool:', err);
                    }
                }

                this.pool = await new sql.ConnectionPool(this.config).connect();
                
                if (await this.verifyConnection()) {
                    console.log('Database pool initialized and verified');
                    this.poolReady = true;
                    this.setupErrorHandler();
                    return;
                }
                throw new Error('Connection verification failed');
            } catch (err) {
                attempts++;
                console.error(`Database connection attempt ${attempts} failed:`, err.message);
                
                if (attempts === this.maxRetries) {
                    throw new Error(`Maximum connection attempts (${this.maxRetries}) exceeded`);
                }

                const delay = Math.min(this.baseDelay * Math.pow(2, attempts - 1), this.maxDelay);
                await new Promise(res => setTimeout(res, delay));
            }
        }
    }

    setupErrorHandler() {
        if (!this.pool) {
            return;
        }

        this.pool.on('error', async err => {
            console.error('Pool error:', err);
            this.poolReady = false;
            try {
                await this.connect();
            } catch (connectErr) {
                console.error('Failed to reconnect after pool error:', connectErr);
            }
        });
    }

    getPool() {
        if (!this.poolReady || !this.pool) {
            throw new Error('Database pool is not ready');
        }
        return this.pool;
    }

    isReady() {
        return this.poolReady && this.pool !== null;
    }

    async close() {
        if (this.pool) {
            try {
                await this.pool.close();
                this.pool = null;
                this.poolReady = false;
            } catch (err) {
                console.error('Error closing pool:', err);
                throw err;
            }
        }
    }
}

export default DatabaseConnection;