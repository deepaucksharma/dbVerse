module.exports = {
    HTTP_STATUS: {
        OK: 200,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        NOT_FOUND: 404,
        SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    },
    DB_RETRY: {
        MAX_RETRIES: 10,
        BASE_DELAY: 5000,
        MAX_DELAY: 30000
    },
    QUERY_TIMEOUTS: {
        DEFAULT: 30000,
        EXTENDED: 60000
    }
};
