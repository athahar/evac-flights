-- Personal travel search history table (staging only)

CREATE TABLE IF NOT EXISTS personal_searches (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  search_type     text NOT NULL CHECK (search_type IN ('flights', 'stays')),
  query_json      jsonb NOT NULL DEFAULT '{}',
  results_count   int NOT NULL DEFAULT 0,
  duration_ms     int NOT NULL DEFAULT 0,
  results_json    jsonb NOT NULL DEFAULT '[]',
  errors_json     jsonb NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_personal_searches_created
  ON personal_searches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_searches_type_created
  ON personal_searches(search_type, created_at DESC);

ALTER TABLE personal_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON personal_searches;

CREATE POLICY "service_role_all"
  ON personal_searches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
