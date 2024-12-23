\set VERBOSITY verbose
\set ON_ERROR_STOP on

DO $$ 
DECLARE
    max_retries INT := 5;
    current_try INT := 0;
    is_connected BOOLEAN := false;
BEGIN
    -- Connection retry loop
    WHILE current_try < max_retries AND NOT is_connected LOOP
        BEGIN
            PERFORM pg_is_in_recovery();
            is_connected := true;
        EXCEPTION WHEN OTHERS THEN
            current_try := current_try + 1;
            IF current_try < max_retries THEN
                PERFORM pg_sleep(5);
            END IF;
        END;
    END LOOP;

    IF NOT is_connected THEN
        RAISE EXCEPTION 'Failed to establish database connection after % attempts', max_retries;
    END IF;

    RAISE NOTICE 'Starting database initialization...';
END $$;

-- Create the employees schema if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'employees') THEN
        CREATE SCHEMA employees;
        ALTER SCHEMA employees OWNER TO postgres;
        REVOKE ALL ON SCHEMA employees FROM PUBLIC;
        GRANT USAGE ON SCHEMA employees TO postgres;
        RAISE NOTICE 'Created employees schema';
    END IF;
END $$;

-- Create extensions with error handling
DO $$
DECLARE
    ext text;
    ordered_extensions text[] := ARRAY[
        'pg_stat_statements',  -- First
        'pg_wait_sampling',
        'pg_stat_monitor',
        'pgcrypto'
    ];
BEGIN
    FOR ext IN SELECT unnest(ordered_extensions)
    LOOP
        BEGIN
            EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I CASCADE', ext);
            RAISE NOTICE 'Successfully created extension: %', ext;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to create extension %: % %', ext, SQLERRM, SQLSTATE;
        END;
    END LOOP;
END $$;

-- Set default search path
ALTER DATABASE employees SET search_path TO employees, public;

DO $$ BEGIN
    RAISE NOTICE 'Database initialization completed successfully.';
END $$;
