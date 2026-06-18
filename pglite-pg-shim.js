/**
 * pg-pglite-shim
 * ----------------
 * Provides a `pg`-compatible API (Pool + Client) backed by @electric-sql/pglite.
 *
 * Why: UltraORM uses `const { Pool } = require('pg')`. By intercepting the
 *      `pg` module's exports and substituting our PGlite-backed Pool, UltraORM
 *      runs unchanged against a real PostgreSQL engine (PGlite is the actual
 *      Postgres source compiled to WASM — not an emulator). This lets us test
 *      UltraORM's *real* SQL generation, parameter binding, transactions, and
 *      relationship code paths without needing to install a Postgres server.
 *
 * Supported API surface (matches what UltraORM uses):
 *   - pool.query(sql, params) -> { rows, rowCount, ... }
 *   - pool.connect() -> client with .query(), .release()
 *   - pool.end()
 *   - pool.on('error', cb)  (no-op, for compat)
 *
 * Limitations (documented in the report):
 *   - No real connection pooling (in-process WASM). All clients share one
 *     PGlite instance, which means transactions are serialized at the PGlite
 *     layer. This affects concurrency benchmarks (noted in the report).
 *   - SET lock_timeout / statement_timeout are accepted (Postgres syntax) but
 *     PGlite's enforcement is best-effort.
 */

const { PGlite } = require('@electric-sql/pglite');

// Singleton PGlite instance — PGlite is single-connection by design.
let _pgliteInstance = null;
let _pglitePromise = null;
const _waitingQueues = new Map(); // txId -> Array<{ resolve, reject }

async function getPglite() {
  if (_pgliteInstance) return _pgliteInstance;
  if (_pglitePromise) return _pglitePromise;
  _pglitePromise = (async () => {
    const path = require('path');
    // Pick a data directory relative to this file so the package is portable.
    // Use a different dir than the v2.0 test harness to avoid lock contention.
    const dataDir = process.env.PGLITE_DATA_DIR
      || path.join(__dirname, '.pglite-data');
    const pglite = new PGlite({ dataDir });
    await pglite;
    _pgliteInstance = pglite;
    return pglite;
  })();
  return _pglitePromise;
}

/**
 * Convert a pg-style result into the shape UltraORM expects.
 * PGlite returns `{ rows: [] }` for SELECT and `{ affectedRows }` for DML.
 * `pg` returns `{ rows, rowCount, oid, command, fields }`.
 */
function normalizeResult(pgliteResult) {
  // PGlite returns an object with `rows` (array) for SELECTs.
  // For INSERT/UPDATE/DELETE it returns `affectedRows` (count).
  if (pgliteResult && Array.isArray(pgliteResult.rows)) {
    return {
      rows: pgliteResult.rows,
      rowCount: pgliteResult.affectedRows != null
        ? pgliteResult.affectedRows
        : pgliteResult.rows.length,
      oid: 0,
      command: pgliteResult.command || '',
      fields: pgliteResult.fields || [],
    };
  }
  // Fallback (shouldn't usually happen)
  return { rows: [], rowCount: 0, oid: 0, command: '', fields: [] };
}

/**
 * ShimClient — mimics pg.Client / a pooled-client returned by pool.connect().
 * PGlite is single-connection, so all clients share the same underlying
 * instance. We track an in-transaction flag so BEGIN/COMMIT/ROLLBACK produced
 * by UltraORM's transaction() path are honored sequentially.
 */
class ShimClient {
  constructor() {
    this._released = false;
    this._inTx = false;
  }

  async query(sql, params) {
    if (this._released) {
      throw new Error('Client has been released back to the pool');
    }
    const pglite = await getPglite();
    const trimmed = (typeof sql === 'string' ? sql : sql.text).trim();

    // Track transaction state for diagnostics.
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('BEGIN')) this._inTx = true;
    else if (upper === 'COMMIT' || upper === 'ROLLBACK') this._inTx = false;

    try {
      const res = await pglite.query(trimmed, params || []);
      return normalizeResult(res);
    } catch (err) {
      // PGlite errors look like standard Postgres errors (with .code, .message).
      // Forward them as-is so UltraORM's deadlock / lock-timeout detection works.
      throw err;
    }
  }

  release() {
    this._released = true;
  }

  on() { /* no-op for compat */ }
  off() { /* no-op for compat */ }
}

/**
 * ShimPool — mimics pg.Pool.
 */
class ShimPool {
  constructor(config) {
    this._config = config || {};
    this._clients = [];
  }

  async query(sql, params) {
    const pglite = await getPglite();
    const text = typeof sql === 'string' ? sql : sql.text;
    try {
      const res = await pglite.query(text, params || []);
      return normalizeResult(res);
    } catch (err) {
      throw err;
    }
  }

  async connect() {
    // Return a client-like object. PGlite is single-connection so we just
    // hand out a thin wrapper.
    await getPglite();
    const client = new ShimClient();
    this._clients.push(client);
    return client;
  }

  async end() {
    // Don't close PGlite — Next.js hot reloads would re-init it.
    // Just mark clients as released.
    this._clients.forEach((c) => { c._released = true; });
    this._clients = [];
  }

  on() { /* no-op for compat */ }
  off() { /* no-op for compat */ }

  get totalCount() { return 1; }
  get idleCount() { return 1; }
  get waitingCount() { return 0; }
}

/**
 * Install the shim: replaces the `Pool` export on the real `pg` module so
 * any subsequent `require('pg')` in this process returns our shim.
 *
 * Call this once at process startup BEFORE requiring UltraORM.
 */
function installPgShim() {
  const pg = require('pg');
  pg.Pool = ShimPool;
  pg.Client = ShimClient;
  // Also patch the default export if anything reads it directly.
  if (pg.default) {
    pg.default.Pool = ShimPool;
    pg.default.Client = ShimClient;
  }
}

module.exports = {
  installPgShim,
  ShimPool,
  ShimClient,
  getPglite,
};
