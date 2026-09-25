-- Esquema existente de Oficina ION v0.3 (idéntico al que creaba initDB).
-- IF NOT EXISTS: en una base ya en uso no cambia nada.
CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT,
      client TEXT,
      notes TEXT,
      kind TEXT,
      local TEXT,
      start_date TEXT,
      reminder INTEGER,
      done BOOLEAN,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      text TEXT,
      department TEXT,
      agent TEXT,
      status TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sectors (
      id TEXT PRIMARY KEY,
      name TEXT,
      agent TEXT
    );
    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      channel TEXT,
      sender TEXT,
      text TEXT,
      direction TEXT,
      status TEXT,
      timestamp BIGINT,
      received_at TEXT,
      provider_id TEXT,
      channel_id TEXT
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      text TEXT,
      reply TEXT,
      status TEXT,
      created_at TEXT,
      tasks JSONB
    );
