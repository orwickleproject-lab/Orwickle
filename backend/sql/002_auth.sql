-- Private application schema: not exposed through Supabase's public data API.
CREATE SCHEMA IF NOT EXISTS orwickle_auth;
REVOKE ALL ON SCHEMA orwickle_auth FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA orwickle_auth TO orwickle_app;

CREATE TABLE IF NOT EXISTS orwickle_auth.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('student','investor','buyer','administrator')),
  email_verified_at timestamptz,
  auth_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orwickle_auth.challenges (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES orwickle_auth.accounts(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('signup','login','recovery')),
  audience text NOT NULL CHECK (audience IN ('mobile','admin')),
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  resends integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS challenges_account ON orwickle_auth.challenges(account_id, created_at);
CREATE TABLE IF NOT EXISTS orwickle_auth.reset_grants (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES orwickle_auth.accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS orwickle_auth.session_store (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS session_store_expire ON orwickle_auth.session_store(expire);
CREATE TABLE IF NOT EXISTS orwickle_auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES orwickle_auth.accounts(id) ON DELETE CASCADE,
  sid varchar NOT NULL UNIQUE,
  device_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  absolute_expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_account ON orwickle_auth.sessions(account_id);
CREATE TABLE IF NOT EXISTS orwickle_auth.rate_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);

-- The runtime role cannot insert arbitrary accounts or change account roles.
CREATE OR REPLACE FUNCTION orwickle_auth.register_public_account(
  p_name text, p_email text, p_hash text, p_role text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_id uuid;
BEGIN
  IF p_role NOT IN ('student','investor','buyer') THEN
    RAISE EXCEPTION 'Public role required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO orwickle_auth.accounts(full_name,email,password_hash,role)
    VALUES (p_name,p_email,p_hash,p_role) RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION orwickle_auth.register_public_account(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION orwickle_auth.register_public_account(text,text,text,text) TO orwickle_app;
GRANT SELECT ON orwickle_auth.accounts TO orwickle_app;
GRANT UPDATE(password_hash,email_verified_at,auth_version,updated_at) ON orwickle_auth.accounts TO orwickle_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON orwickle_auth.challenges,orwickle_auth.reset_grants,
  orwickle_auth.session_store,orwickle_auth.sessions,orwickle_auth.rate_buckets TO orwickle_app;

-- RLS is enabled; the trusted Express runtime is the only non-owner role allowed.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','challenges','reset_grants','session_store','sessions','rate_buckets'] LOOP
    EXECUTE format('ALTER TABLE orwickle_auth.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='orwickle_auth' AND tablename=t AND policyname='express_only') THEN
      EXECUTE format('CREATE POLICY express_only ON orwickle_auth.%I TO orwickle_app USING (true) WITH CHECK (true)',t);
    END IF;
    EXECUTE format('REVOKE ALL ON orwickle_auth.%I FROM PUBLIC,anon,authenticated', t);
  END LOOP;
END $$;
