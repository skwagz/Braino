import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import type { Preview, Event } from '../organizer.ts';

export interface Session {
  id: string; csrf: string; expiresAt: number; owner: string | null; email?: string;
  oauth?: { state: string; nonce: string; verifier: string; expiresAt: number };
}
export interface Run {
  id: string; owner: string; folderId: string; createdAt: number;
  status: 'scanning' | 'ready' | 'applying' | 'complete' | 'failed';
  preview?: Preview; result?: { moved: number }; error?: string;
}
export const secret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export class Repository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS runs_owner ON runs(owner, created);
      CREATE TABLE IF NOT EXISTS demo (owner TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, run TEXT NOT NULL, data TEXT NOT NULL);`);
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    for (const row of this.db.prepare('SELECT data FROM runs').all()) {
      const run = JSON.parse(String(row.data)) as Run;
      if (run.status === 'scanning' || run.status === 'applying') {
        this.saveRun({ ...run, status: 'failed', error: 'Server restarted during the run. Inspect Drive before creating a fresh scan.' });
      }
    }
  }
  close() { this.db.close(); }
  newSession(demo: boolean) {
    const token = secret();
    const session: Session = { id: digest(token), csrf: secret(), expiresAt: Date.now() + 7 * 24 * 3600_000,
      owner: demo ? `demo:${secret()}` : null };
    this.saveSession(session);
    return { token, session };
  }
  session(token: string) {
    const row = this.db.prepare('SELECT data FROM sessions WHERE id = ? AND expires > ?').get(digest(token), Date.now());
    return row ? JSON.parse(String(row.data)) as Session : null;
  }
  saveSession(session: Session) {
    this.db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)').run(session.id, session.expiresAt, JSON.stringify(session));
  }
  deleteSession(id: string) { this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id); }
  removeOwnerSessions(owner: string) {
    for (const row of this.db.prepare('SELECT data FROM sessions').all()) {
      const session = JSON.parse(String(row.data)) as Session;
      if (session.owner === owner) this.deleteSession(session.id);
    }
  }
  runs(owner: string) {
    return this.db.prepare('SELECT data FROM runs WHERE owner = ? ORDER BY created DESC LIMIT 100').all(owner)
      .map(row => JSON.parse(String(row.data)) as Run);
  }
  run(id: string, owner: string) {
    const row = this.db.prepare('SELECT data FROM runs WHERE id = ? AND owner = ?').get(id, owner);
    return row ? JSON.parse(String(row.data)) as Run : null;
  }
  saveRun(run: Run) {
    this.db.prepare('INSERT OR REPLACE INTO runs VALUES (?, ?, ?, ?)').run(run.id, run.owner, run.createdAt, JSON.stringify(run));
  }
  event(run: string, event: Event | { type: 'failed'; message: string }) {
    this.db.prepare('INSERT INTO events(run, data) VALUES (?, ?)').run(run, JSON.stringify({ at: new Date().toISOString(), ...event }));
  }
  events(run: string) {
    return this.db.prepare('SELECT data FROM events WHERE run = ? ORDER BY id').all(run).map(row => JSON.parse(String(row.data)) as unknown);
  }
  demo(owner: string): string | null {
    const row = this.db.prepare('SELECT data FROM demo WHERE owner = ?').get(owner);
    return row ? String(row.data) : null;
  }
  saveDemo(owner: string, value: string) { this.db.prepare('INSERT OR REPLACE INTO demo VALUES (?, ?)').run(owner, value); }
  resetDemo(owner: string) {
    this.db.prepare('DELETE FROM demo WHERE owner = ?').run(owner);
    this.db.prepare('DELETE FROM events WHERE run IN (SELECT id FROM runs WHERE owner = ?)').run(owner);
    this.db.prepare('DELETE FROM runs WHERE owner = ?').run(owner);
  }
}
