-- Setup-only helper. A generated password never appears in SQL text or parameters.
-- Caller reads the transaction-local setting once and saves it in an ignored environment.
DO $setup$
DECLARE generated text; flags record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='orwickle_app') THEN
    CREATE ROLE orwickle_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10;
  END IF;
  SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls INTO flags FROM pg_roles WHERE rolname='orwickle_app';
  IF flags.rolsuper OR flags.rolcreatedb OR flags.rolcreaterole OR flags.rolreplication OR flags.rolbypassrls THEN
    RAISE EXCEPTION 'Unexpected runtime role privileges';
  END IF;
  generated := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  EXECUTE format('ALTER ROLE orwickle_app PASSWORD %L',generated);
  PERFORM set_config('orwickle.runtime_password',generated,true);
END $setup$;
