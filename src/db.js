'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SEED_FILE = path.join(__dirname, '..', 'data', 'internships.json');

function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS internships (
      id             INTEGER PRIMARY KEY,
      title          TEXT NOT NULL,
      company        TEXT NOT NULL,
      location       TEXT NOT NULL,
      mode           TEXT NOT NULL CHECK (mode IN ('remote','hybrid','onsite')),
      category       TEXT NOT NULL,
      stipend        TEXT NOT NULL,
      duration_weeks INTEGER NOT NULL,
      deadline       TEXT NOT NULL,
      description    TEXT NOT NULL,
      skills         TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      internship_id INTEGER NOT NULL REFERENCES internships(id),
      full_name     TEXT NOT NULL,
      email         TEXT NOT NULL,
      school        TEXT NOT NULL DEFAULT '',
      cover_note    TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      UNIQUE (internship_id, email)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_internships_mode ON internships (mode);
    CREATE INDEX IF NOT EXISTS idx_internships_deadline ON internships (deadline, id);
  `);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM internships').get();
  if (n === 0) seed(db);
  return db;
}

const isoDay = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);

function seed(db) {
  const rows = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  const insert = db.prepare(
    `INSERT INTO internships (id,title,company,location,mode,category,stipend,duration_weeks,deadline,description,skills)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      // Seed files may give an absolute `deadline` or `closesInDays` (relative to first start,
      // so a fresh deploy never shows listings that have already closed).
      const deadline = r.deadline ?? (Number.isFinite(r.closesInDays) ? isoDay(r.closesInDays) : undefined);
      const missing = [...['id', 'title', 'company', 'location', 'mode'].filter((k) => r[k] == null || r[k] === ''), ...(deadline ? [] : ['deadline or closesInDays'])];
      if (missing.length) {
        throw new Error(`data/internships.json: record ${JSON.stringify(r.id ?? r.title ?? '?')} is missing required field(s): ${missing.join(', ')}`);
      }
      insert.run(
        Number(r.id), String(r.title), String(r.company), String(r.location), String(r.mode),
        String(r.category ?? 'General'), String(r.stipend ?? 'Not stated'),
        Number(r.durationWeeks ?? r.duration_weeks ?? 8), String(deadline),
        String(r.description ?? ''), JSON.stringify(Array.isArray(r.skills) ? r.skills : [])
      );
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const toApi = (r) => ({
  id: r.id, title: r.title, company: r.company, location: r.location, mode: r.mode,
  category: r.category, stipend: r.stipend, durationWeeks: r.duration_weeks,
  deadline: r.deadline, description: r.description, skills: JSON.parse(r.skills),
});

// Escape LIKE wildcards so a user typing "%" or "_" searches for the literal character.
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// SECURITY: every user-supplied value goes through a "?" placeholder. SQL text below is
// built only from fixed string literals, never from user input.
function listInternships(db, { q, type, location, page, pageSize }) {
  const where = [];
  const params = [];
  if (q) {
    where.push(`(title LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR skills LIKE ? ESCAPE '\\')`);
    const like = `%${escapeLike(q)}%`;
    params.push(like, like, like, like);
  }
  if (type) { where.push('mode = ?'); params.push(type); }
  if (location) { where.push(`location LIKE ? ESCAPE '\\'`); params.push(`%${escapeLike(location)}%`); }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM internships' + clause).get(...params);
  const rows = db
    .prepare('SELECT * FROM internships' + clause + ' ORDER BY deadline ASC, id ASC LIMIT ? OFFSET ?')
    .all(...params, pageSize, (page - 1) * pageSize);
  return {
    data: rows.map(toApi),
    meta: { page, pageSize, total: n, totalPages: Math.max(1, Math.ceil(n / pageSize)) },
  };
}

function getInternship(db, id) {
  const row = db.prepare('SELECT * FROM internships WHERE id = ?').get(id);
  return row ? toApi(row) : null;
}

// Returns { ok:true, id } or { ok:false, duplicate:true }
function createApplication(db, v) {
  try {
    const info = db
      .prepare(`INSERT INTO applications (internship_id, full_name, email, school, cover_note, created_at)
                VALUES (?,?,?,?,?,?)`)
      .run(v.internshipId, v.fullName, v.email, v.school, v.coverNote, new Date().toISOString());
    return { ok: true, id: Number(info.lastInsertRowid) };
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(err.message)) return { ok: false, duplicate: true };
    throw err;
  }
}

// Used by the readiness probe: proves the database answers a real query.
function ping(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM internships').get().n;
}

module.exports = { openDb, listInternships, getInternship, createApplication, ping };
