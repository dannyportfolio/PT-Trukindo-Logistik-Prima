-- Inisialisasi role runtime astraops_app pada container PostgreSQL fresh
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'astraops_app') THEN
        CREATE ROLE astraops_app WITH LOGIN PASSWORD 'app_secure_password';
    END IF;
END
$$;
