import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.MIND_MAP_DB || `${__dirname}/data/mindmap.db`

mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    layout TEXT,
    theme TEXT,
    revision INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    map_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    source TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS shares (
    token TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    created_at TEXT,
    expires_at TEXT,
    revoked INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_versions_map_id ON versions(map_id);
  CREATE INDEX IF NOT EXISTS idx_shares_map_id ON shares(map_id);
`)

const DEFAULT_DATA = {
  root: { data: { text: '根节点' }, children: [] },
  theme: { template: 'avocado', config: {} },
  layout: 'logicalStructure',
  config: {},
  view: null
}

function now () {
  return new Date().toISOString()
}

function extractLayout (data) {
  return data?.layout || null
}

function extractTheme (data) {
  return data?.theme?.template || null
}

export { DEFAULT_DATA }

export function createMap ({ id, title, data, updatedBy = 'import' }) {
  const createdAt = now()
  const stmt = db.prepare(`
    INSERT INTO maps (id, title, data, layout, theme, revision, created_at, updated_at, updated_by)
    VALUES (:id, :title, :data, :layout, :theme, :revision, :created_at, :updated_at, :updated_by)
  `)
  stmt.run({
    id,
    title,
    data: JSON.stringify(data),
    layout: extractLayout(data),
    theme: extractTheme(data),
    revision: 1,
    created_at: createdAt,
    updated_at: createdAt,
    updated_by: updatedBy
  })
  return getMap(id)
}

export function getMap (id) {
  const stmt = db.prepare('SELECT * FROM maps WHERE id = :id')
  const row = stmt.get({ id })
  if (!row) return null
  return rowToMap(row)
}

export function listMaps () {
  const stmt = db.prepare(`
    SELECT id, title, layout, theme, revision, updated_at, updated_by
    FROM maps
    ORDER BY updated_at DESC
  `)
  return stmt.all().map(row => ({
    id: row.id,
    title: row.title,
    layout: row.layout,
    theme: row.theme,
    revision: row.revision,
    updated_at: row.updated_at,
    updated_by: row.updated_by
  }))
}

export function updateMap ({ id, title, data, revision, updatedBy = 'human' }) {
  const stmt = db.prepare(`
    UPDATE maps
    SET title = :title,
        data = :data,
        layout = :layout,
        theme = :theme,
        revision = :revision,
        updated_at = :updated_at,
        updated_by = :updated_by
    WHERE id = :id
  `)
  const updatedAt = now()
  stmt.run({
    id,
    title,
    data: JSON.stringify(data),
    layout: extractLayout(data),
    theme: extractTheme(data),
    revision,
    updated_at: updatedAt,
    updated_by: updatedBy
  })
  return getMap(id)
}

export function deleteMap (id) {
  db.prepare('DELETE FROM maps WHERE id = :id').run({ id })
  db.prepare('DELETE FROM versions WHERE map_id = :id').run({ id })
  db.prepare('DELETE FROM shares WHERE map_id = :id').run({ id })
}

export function renameMap ({ id, title }) {
  const stmt = db.prepare('UPDATE maps SET title = :title, updated_at = :updated_at WHERE id = :id')
  stmt.run({ id, title, updated_at: now() })
  return getMap(id)
}

// 版本快照
export function createVersion ({ mapId, revision, data, source }) {
  const stmt = db.prepare(`
    INSERT INTO versions (map_id, revision, data, source, created_at)
    VALUES (:map_id, :revision, :data, :source, :created_at)
  `)
  stmt.run({
    map_id: mapId,
    revision,
    data: JSON.stringify(data),
    source,
    created_at: now()
  })
}

export function listVersions (mapId) {
  const stmt = db.prepare(`
    SELECT id, map_id, revision, source, created_at
    FROM versions
    WHERE map_id = :map_id
    ORDER BY id DESC
  `)
  return stmt.all({ map_id: mapId }).map(row => ({
    id: row.id,
    mapId: row.map_id,
    revision: row.revision,
    source: row.source,
    created_at: row.created_at
  }))
}

export function getVersion (id) {
  const stmt = db.prepare('SELECT * FROM versions WHERE id = :id')
  const row = stmt.get({ id })
  if (!row) return null
  return {
    id: row.id,
    mapId: row.map_id,
    revision: row.revision,
    data: JSON.parse(row.data),
    source: row.source,
    created_at: row.created_at
  }
}

export function getLastVersion (mapId) {
  const stmt = db.prepare(`
    SELECT * FROM versions
    WHERE map_id = :map_id
    ORDER BY id DESC
    LIMIT 1
  `)
  const row = stmt.get({ map_id: mapId })
  if (!row) return null
  return {
    id: row.id,
    mapId: row.map_id,
    revision: row.revision,
    data: JSON.parse(row.data),
    source: row.source,
    created_at: row.created_at
  }
}

// 分享
export function createShare ({ token, mapId, expiresAt }) {
  const stmt = db.prepare(`
    INSERT INTO shares (token, map_id, created_at, expires_at, revoked)
    VALUES (:token, :map_id, :created_at, :expires_at, 0)
  `)
  stmt.run({
    token,
    map_id: mapId,
    created_at: now(),
    expires_at: expiresAt || null
  })
}

export function getShare (token) {
  const stmt = db.prepare('SELECT * FROM shares WHERE token = :token')
  const row = stmt.get({ token })
  if (!row) return null
  return {
    token: row.token,
    mapId: row.map_id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked: !!row.revoked
  }
}

export function revokeShare (token) {
  const stmt = db.prepare('UPDATE shares SET revoked = 1 WHERE token = :token')
  stmt.run({ token })
}

export function listShares (mapId) {
  const stmt = db.prepare(`
    SELECT token, map_id, created_at, expires_at, revoked
    FROM shares
    WHERE map_id = :map_id
    ORDER BY created_at DESC
  `)
  return stmt.all({ map_id: mapId }).map(row => ({
    token: row.token,
    mapId: row.map_id,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked: !!row.revoked
  }))
}

function rowToMap (row) {
  return {
    id: row.id,
    title: row.title,
    data: JSON.parse(row.data),
    layout: row.layout,
    theme: row.theme,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by
  }
}
