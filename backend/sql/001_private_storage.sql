-- Run against the development project with trusted server-side credentials.
-- No client policies: confidential files are inaccessible through anonymous/user APIs.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('orwickle-confidential', 'orwickle-confidential', false, 10485760)
ON CONFLICT (id) DO NOTHING;
