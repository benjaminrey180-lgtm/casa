-- Usuarios y sesiones del panel.
CREATE TABLE IF NOT EXISTS users (
   id TEXT PRIMARY KEY,
   email TEXT UNIQUE NOT NULL,
   name TEXT NOT NULL,
   password_hash TEXT NOT NULL,
   role TEXT NOT NULL,
   tenant TEXT,
   active BOOLEAN NOT NULL DEFAULT TRUE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS sessions (
   token_hash TEXT PRIMARY KEY,
   user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   expires_at TIMESTAMPTZ NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
