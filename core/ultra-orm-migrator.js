'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Migrator
 * Usage:
 *   const migrator = new Migrator(orm, { migrationsPath: './migrations' });
 *   await migrator.migrate(); // apply all pending
 *   await migrator.rollback(1); // rollback last 1 migration
 *   await migrator.status();
 *   await migrator.createMigration('add-users-table');
 */
class Migrator {
  constructor(orm, options = {}) {
    if (!orm) throw new Error('Migrator requires an UltraORM instance');
    this.orm = orm;
    this.adapter = orm.adapter;
    this.migrationsPath = options.migrationsPath || path.resolve(process.cwd(), 'migrations');
    this.tableName = options.migrationsTable || 'migrations';
    this.logger = options.logger || console;
  }

  async ensureMigrationsTable() {
    // For SQL DBs store applied migrations
    if (this.orm.config.type === 'mongodb') {
      const db = this.adapter.client.db(this.orm.config.database);
      const col = db.collection(this.tableName);
      // create unique index on name
      await col.createIndex({ name: 1 }, { unique: true }).catch(() => {});
      return;
    }

    // create table if not exists (simple structure)
    const columns = [
      'id SERIAL PRIMARY KEY',
      "name VARCHAR(255) NOT NULL",
      "batch INT NOT NULL",
      "migration_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    ];
    const createSQL = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns.join(', ')})`;
    await this.adapter.execute(createSQL);
  }

  async loadMigrationFiles() {
    if (!fs.existsSync(this.migrationsPath)) return [];
    const files = fs.readdirSync(this.migrationsPath)
      .filter(f => f.endsWith('.js'))
      .sort(); // alphabetical (timestamp prefix recommended)
    return files.map(f => ({ name: f, path: path.join(this.migrationsPath, f) }));
  }

  async appliedMigrations() {
    await this.ensureMigrationsTable();
    if (this.orm.config.type === 'mongodb') {
      const db = this.adapter.client.db(this.orm.config.database);
      const rows = await db.collection(this.tableName).find({}).sort({ migration_time: 1 }).toArray();
      return rows.map(r => r.name);
    } else {
      const sql = `SELECT name FROM ${this.tableName} ORDER BY migration_time ASC, id ASC`;
      const { rows } = await this.adapter.execute(sql);
      return rows.map(r => r.name);
    }
  }

  async nextBatchNumber() {
    await this.ensureMigrationsTable();
    if (this.orm.config.type === 'mongodb') {
      const db = this.adapter.client.db(this.orm.config.database);
      const last = await db.collection(this.tableName).find({}).sort({ batch: -1 }).limit(1).toArray();
      return (last[0]?.batch || 0) + 1;
    } else {
      const sql = `SELECT MAX(batch) as max_batch FROM ${this.tableName}`;
      const { rows } = await this.adapter.execute(sql);
      const maxBatch = rows[0] && (rows[0].max_batch ?? rows[0].maxbatch ?? Object.values(rows[0])[0]) || 0;
      return (parseInt(maxBatch, 10) || 0) + 1;
    }
  }

  // helper: run migration function inside a transaction/session and provide a runQuery helper
  async _runMigrationFunction(migrationFn) {
    const self = this;
    return await this.adapter.transaction(async (ctx) => {
      // ctx is DB-specific:
      // - Postgres: client with .query(sql, params)
      // - MySQL: connection with .execute(sql, params) (and maybe .query)
      // - MongoDB: { session, db } (adapter.transaction already passes this)
      // Provide normalized runner:
      const runQuery = async (sql, params = []) => {
        if (!sql) throw new Error('SQL required');
        // For postgres client (has query)
        if (ctx && typeof ctx.query === 'function') {
          // convert ? placeholders to $1.. if adapter hasn't done so (adapter handles conversion for adapter.execute,
          // but here we directly have client; ensure adapter._convertPlaceholders)
          const converted = this.adapter._convertPlaceholders(sql, params);
          const res = await ctx.query(converted.sql, converted.params);
          return res;
        }
        // For mysql connection (has execute)
        if (ctx && typeof ctx.execute === 'function') {
          const [rows, result] = await ctx.execute(sql, params);
          return { rows, result };
        }
        // For mongodb, run against db
        if (ctx && ctx.db) {
          throw new Error('Use MongoDB driver in migrations directly (ctx.db.collection(...))');
        }
        // fallback to adapter.execute
        return await this.adapter.execute(sql, params);
      };

      // Provide object passed to migration file functions
      const migrationContext = {
        orm: this.orm,
        adapter: this.adapter,
        ctx,
        runQuery,
        log: this.logger
      };

      // Execute migration function (user-supplied)
      await migrationFn(migrationContext);
    });
  }

  // Apply all pending migrations
  async migrate() {
    await this.ensureMigrationsTable();

    const migrationFiles = await this.loadMigrationFiles();
    const applied = await this.appliedMigrations();
    const pending = migrationFiles.filter(m => !applied.includes(m.name));
    if (pending.length === 0) {
      this.logger.log('No pending migrations');
      return [];
    }

    const batch = await this.nextBatchNumber();
    const appliedNames = [];

    for (const m of pending) {
      this.logger.log(`Applying migration ${m.name}...`);
      // load file
      const migration = require(m.path);
      if (!migration.up || typeof migration.up !== 'function') {
        throw new Error(`Migration ${m.name} does not export an 'up' async function`);
      }

      // run inside adapter.transaction
      await this._runMigrationFunction(async (context) => {
        await migration.up(context);
      });

      // record applied
      if (this.orm.config.type === 'mongodb') {
        const db = this.adapter.client.db(this.orm.config.database);
        await db.collection(this.tableName).insertOne({ name: m.name, batch, migration_time: new Date() });
      } else {
        await this.adapter.execute(
          `INSERT INTO ${this.tableName} (name, batch) VALUES (?, ?)`,
          [m.name, batch]
        );
      }
      this.logger.log(`✓ Applied ${m.name}`);
      appliedNames.push(m.name);
    }

    return appliedNames;
  }

  // Rollback last N batches (default 1)
  async rollback(steps = 1) {
    await this.ensureMigrationsTable();

    if (this.orm.config.type === 'mongodb') {
      const db = this.adapter.client.db(this.orm.config.database);
      const lastBatchDoc = await db.collection(this.tableName).find({}).sort({ batch: -1 }).limit(1).toArray();
      const lastBatch = lastBatchDoc[0]?.batch || null;
      if (lastBatch === null) {
        this.logger.log('No migrations to rollback');
        return [];
      }
      const toRollback = await db.collection(this.tableName).find({ batch: lastBatch }).sort({ migration_time: -1 }).toArray();
      const rolled = [];
      for (const row of toRollback) {
        const mpath = path.join(this.migrationsPath, row.name);
        if (!fs.existsSync(mpath)) {
          this.logger.warn(`Migration file ${row.name} missing; skipping rollback`);
          continue;
        }
        const migration = require(mpath);
        if (!migration.down || typeof migration.down !== 'function') {
          this.logger.warn(`Migration ${row.name} has no down(); skipping`);
          continue;
        }
        this.logger.log(`Rolling back ${row.name}...`);
        await this._runMigrationFunction(async (ctx) => {
          await migration.down({ orm: this.orm, adapter: this.adapter, ctx, runQuery: () => { throw new Error('Use MongoDB db/collection in down()'); }});
        });
        await db.collection(this.tableName).deleteOne({ name: row.name });
        rolled.push(row.name);
        this.logger.log(`✓ Rolled back ${row.name}`);
      }
      return rolled;
    }

    // For SQL: find last batch number
    const { rows } = await this.adapter.execute(`SELECT MAX(batch) as max_batch FROM ${this.tableName}`);
    const maxBatch = rows[0] && (rows[0].max_batch ?? Object.values(rows[0])[0]);
    if (!maxBatch) {
      this.logger.log('No migrations to rollback');
      return [];
    }
    const lastBatch = parseInt(maxBatch, 10);
    // get migrations in that batch in reverse order
    const { rows: batchRows } = await this.adapter.execute(`SELECT name FROM ${this.tableName} WHERE batch = ? ORDER BY id DESC`, [lastBatch]);
    const rolled = [];
    for (const r of batchRows) {
      const name = r.name;
      const p = path.join(this.migrationsPath, name);
      if (!fs.existsSync(p)) {
        this.logger.warn(`Migration file ${name} missing; skipping rollback`);
        continue;
      }
      const migration = require(p);
      if (!migration.down || typeof migration.down !== 'function') {
        this.logger.warn(`Migration ${name} has no down(); skipping`);
        continue;
      }
      this.logger.log(`Rolling back ${name}...`);
      await this._runMigrationFunction(async (ctx) => {
        await migration.down({ orm: this.orm, adapter: this.adapter, ctx, runQuery: async (sql, params) => { return await ctx.query ? ctx.query(sql, params) : ctx.execute(sql, params); }});
      });
      await this.adapter.execute(`DELETE FROM ${this.tableName} WHERE name = ?`, [name]);
      this.logger.log(`✓ Rolled back ${name}`);
      rolled.push(name);
    }
    return rolled;
  }

  // Show status
  async status() {
    const files = await this.loadMigrationFiles();
    const applied = await this.appliedMigrations();
    const status = files.map(f => ({ name: f.name, applied: applied.includes(f.name) }));
    this.logger.table ? this.logger.table(status) : this.logger.log(status);
    return status;
  }

  // Create a new migration file with timestamp prefix
  async createMigration(name) {
    if (!name) throw new Error('Migration name required');
    if (!fs.existsSync(this.migrationsPath)) fs.mkdirSync(this.migrationsPath, { recursive: true });
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDhhmmss
    const safe = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
    const filename = `${ts}-${safe}.js`;
    const filepath = path.join(this.migrationsPath, filename);
    const template = `/**
 * Migration: ${filename}
 *
 * Export async functions: up({ orm, adapter, ctx, runQuery, log }) and down(...)
 *
 * For SQL databases you can use runQuery(sql, params) or adapter.execute(sql, params)
 * For MongoDB use ctx.db.collection('name') with ctx.session when needed.
 */

module.exports.up = async function({ orm, adapter, ctx, runQuery, log }) {
  // example: create table (SQL)
  // await runQuery('CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(255))');
};

module.exports.down = async function({ orm, adapter, ctx, runQuery, log }) {
  // undo the up()
  // await runQuery('DROP TABLE users');
};
`;
    fs.writeFileSync(filepath, template);
    this.logger.log(`Created migration ${filename}`);
    return filepath;
  }
}

/**
 * CLI helper when file is executed directly
 */
if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const cmd = argv[0];
    const arg = argv[1];

    // This CLI expects a tiny config file at ./orm-migrator-bootstrap.js exporting a connected UltraORM instance:
    const bootstrapPath = path.resolve(process.cwd(), 'orm-migrator-bootstrap.js');
    if (!fs.existsSync(bootstrapPath)) {
      console.error('Bootstrap file orm-migrator-bootstrap.js not found in CWD. Create it and export a connected UltraORM instance (module.exports = orm;).');
      process.exit(1);
    }
    const orm = require(bootstrapPath);
    if (!orm) {
      console.error('Bootstrap must export an UltraORM instance (connected)');
      process.exit(1);
    }
    const migrator = new Migrator(orm, { migrationsPath: path.resolve(process.cwd(), 'migrations') });

    try {
      if (cmd === 'create') {
        await migrator.createMigration(arg);
      } else if (cmd === 'up' || cmd === 'migrate') {
        const applied = await migrator.migrate();
        console.log('Applied:', applied);
      } else if (cmd === 'rollback') {
        const steps = arg ? parseInt(arg, 10) : 1;
        const rolled = await migrator.rollback(steps);
        console.log('Rolled back:', rolled);
      } else if (cmd === 'status') {
        await migrator.status();
      } else {
        console.log('Usage: node ultra-orm-migrator.js create NAME | up | rollback [steps] | status');
      }
    } catch (err) {
      console.error('Migration error:', err);
      process.exit(2);
    } finally {
      if (orm && typeof orm.disconnect === 'function') await orm.disconnect();
      process.exit(0);
    }
  })();
}

module.exports = Migrator;