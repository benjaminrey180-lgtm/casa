-- Placas NFC/QR con destino editable y analítica sin datos personales (no se guarda IP ni user-agent).
CREATE TABLE IF NOT EXISTS nfc_tags (
  code TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  actions JSONB NOT NULL DEFAULT '[]',
  redirect_action TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  visits INTEGER NOT NULL DEFAULT 0,
  last_access TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nfc_events (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL REFERENCES nfc_tags(code) ON UPDATE CASCADE,
  action TEXT NOT NULL,
  device TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nfc_events_code_time ON nfc_events (code, created_at);
