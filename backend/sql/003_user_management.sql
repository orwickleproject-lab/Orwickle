-- Narrow owner-defined operation for the trusted Express administrator routes.
CREATE OR REPLACE FUNCTION orwickle_auth.update_public_user(
  p_id uuid, p_name text, p_role text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous_role text;
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 100
    OR p_role IS NULL OR p_role NOT IN ('student','investor','buyer') THEN
    RAISE EXCEPTION 'Valid name and public role required' USING ERRCODE = '22023';
  END IF;
  SELECT role INTO previous_role FROM orwickle_auth.accounts WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR previous_role='administrator' THEN RETURN NULL; END IF;
  UPDATE orwickle_auth.accounts SET full_name=btrim(p_name),role=p_role,
    auth_version=auth_version+CASE WHEN previous_role<>p_role THEN 1 ELSE 0 END,
    updated_at=now() WHERE id=p_id;
  IF previous_role<>p_role THEN
    UPDATE orwickle_auth.challenges SET consumed_at=now() WHERE account_id=p_id AND consumed_at IS NULL;
    UPDATE orwickle_auth.reset_grants SET consumed_at=now() WHERE account_id=p_id AND consumed_at IS NULL;
    DELETE FROM orwickle_auth.session_store WHERE sid IN
      (SELECT sid FROM orwickle_auth.sessions WHERE account_id=p_id);
    UPDATE orwickle_auth.sessions SET revoked_at=now() WHERE account_id=p_id AND revoked_at IS NULL;
  END IF;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION orwickle_auth.update_public_user(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION orwickle_auth.update_public_user(uuid,text,text) TO orwickle_app;
