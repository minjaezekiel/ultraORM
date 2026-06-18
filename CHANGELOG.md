# Changelog

## [2.1.0] — 2026-06-17

Critical bug-fix release. v2.0.0 had four silent data-loss / silent no-op bugs
that blocked production deployment on PostgreSQL. v2.1.0 fixes all four,
plus several additional correctness and SQL-injection-safety improvements
identified during the audit.

All fixes are verified by a new test suite (51 tests across 3 suites —
unit, integration, performance) that runs against real PostgreSQL via PGlite.

### Critical fixes (data loss / blocks usage)

- **BUG-01: Missing PRIMARY KEY on SERIAL columns**
  `Field.getSQLDefinition()` skipped the `PRIMARY KEY` clause when
  `autoIncrement: true` (the canonical PK declaration). On PostgreSQL this
  produced `id SERIAL NOT NULL` with no PK constraint, which silently broke
  every `FOREIGN KEY ... REFERENCES` on the table. Any model with an
  auto-incrementing PK could not have FKs pointing to it.

  Fix: emit `PRIMARY KEY` whenever `primaryKey: true`, regardless of
  `autoIncrement`. Also skip redundant `UNIQUE` when already `PRIMARY KEY`.

- **BUG-02: MySQL-style inline ENUM on PostgreSQL**
  `EnumField` hardcoded `ENUM('a','b')` as the column type. PostgreSQL does
  not support inline ENUM — it requires `CREATE TYPE foo_enum AS ENUM(...)`
  first, then referencing the type by name. Every model with an EnumField
  failed to migrate on PostgreSQL with `type "enum" does not exist`.

  Fix: in `Model.sync()`, scan for EnumFields when adapterType is postgres,
  pre-create a named enum type per `(table,column)` via an idempotent
  `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN null; END $$`
  block, and override the field's `dbType` to reference the named type.

- **BUG-03: MoneyField silently corrupts values on hydration**
  The model constructor called `set()` on every field, including when
  hydrating instances from a database row. `set()` calls `prepareValue()`,
  which for MoneyField converts dollars → integer cents. So reading a row
  with `balance = 1999` (cents) would call `prepareValue(1999)`, treating
  1999 as dollars and storing `199900` cents. Every MoneyField value was
  silently wrong by a factor of 100 on read.

  Fix: add a `fromDatabase: true` flag to the Model constructor that
  bypasses `set()` and assigns raw values directly. Update `find()`,
  `_executeSQL()`, `_findMongoDB()`, and `bulkCreate()` to pass this flag
  when hydrating from DB rows.

  Note: the original BUG-03 description (insert/update skip prepareValue)
  was the right diagnosis but the wrong fix — calling prepareValue() in
  insert/update would double-convert because set() already prepared. The
  real root cause was the constructor re-preparing DB values. The proper
  fix is the `fromDatabase` flag.

- **BUG-04: belongsToMany eager loading always returned empty**
  `_loadBelongsToMany` accessed junction-record fields via `r[foreignKey]`
  (direct property access) instead of `r.get(foreignKey)`. When `through`
  was a Model class (the common case), `through.find(where)` returns Model
  instances whose field values are exposed via `.get()`, not direct
  properties. So `r[foreignKey]` was `undefined`, `targetIds` was empty,
  and every `belongsToMany` include silently returned `[]`.

  Fix: add a `getVal(r, k)` helper that calls `r.get(k)` on Model instances
  and `r[k]` on plain objects. Use it for all field access in the loader.

### Major fixes (broken features)

- **BUG-05: morphToMany / morphedByMany were defined but never loaded**
  `Model.morphToMany()` and `Model.morphedByMany()` registered associations
  of type `morphToMany` / `morphedByMany`, but `_eagerLoad()` had no case
  for these types — `include()` silently did nothing.

  Fix: add `_loadMorphToMany()` and `_loadMorphedByMany()` loaders, and
  dispatch them from `_eagerLoad()`.

- **BUG-06: hasManyThrough was routed to the wrong loader**
  `_eagerLoad()` dispatched `hasManyThrough` to `_loadBelongsToMany`, which
  uses `foreignKey` + `otherKey` semantics. But hasManyThrough has a
  different shape: `Source.id -> Through.foreignKey -> Through.throughKey
  matches Source.id`, then `Through.targetKey matches Target.id`. The
  routing silently returned wrong results.

  Fix: write a dedicated `_loadHasManyThrough()` loader that respects
  `foreignKey`, `throughKey`, and `targetKey`. Also handle the case where
  multiple target records share the same `targetKey` value (e.g. 2 posts
  from the same user) — index them as a list, not overwrite.

- **BUG-07: update() used MySQL-style ? placeholders on PostgreSQL**
  `Model.update()` built SQL with `?` placeholders unconditionally. On
  PostgreSQL this worked only because `adapter.execute()` calls
  `_convertPlaceholders()` to rewrite `?` → `$N`. But the SQL was
  semantically wrong and would break any future code that bypassed
  `execute()`.

  Fix: build the correct placeholder form per adapter (`$N` for postgres,
  `?` for mysql). Also escape table, column, and PK identifiers.

- **BUG-08: insertReturning bypassed placeholder conversion & escaping**
  `DBAdapter.insertReturning()` called `this.pool.query()` directly,
  bypassing `_convertPlaceholders` and `execute()`. It also interpolated
  raw `${table}` and `${cols.join(',')}` into SQL — an SQL injection vector
  if a caller passed user-controlled identifiers (rare but possible).

  Fix: route through `execute()` and escape all identifiers via
  `escapeIdentifier()`.

- **BUG-09: Model constructor double-prepared DB values**
  See BUG-03 above — same root cause, fixed by the `fromDatabase` flag.

### Minor fixes (SQL injection safety, performance)

- **BUG-10: Emojis in console.log output**
  Removed all emojis from `console.log` / `console.error` messages
  throughout `core.js`. Replaced the green-check, red-x, and warning-triangle
  emojis with `[OK]` / `[FAIL]` / `[!]` ASCII equivalents for log-friendliness
  on terminals without emoji support.

- **BUG-11: _loadBelongsToMany raw SQL path didn't escape identifiers**
  When `through` was passed as a string (table name), the loader
  interpolated raw `${through}` and `${foreignKey}` into the SQL — an SQL
  injection vector if a user-controlled string was passed as `through`.

  Fix: escape both identifiers via `escapeIdentifier()`.

- **BUG-12: bulkCreate didn't call prepareValue and assumed contiguous IDs**
  `bulkCreate` pushed raw values to SQL without calling `prepareValue()`
  (MoneyField values would be stored as raw dollars in BIGINT columns,
  truncating fractional parts). It also assumed auto-increment IDs were
  contiguous starting at `result.insertId` — true for MySQL, FALSE for
  PostgreSQL (which doesn't return `insertId` from a multi-row INSERT).
  On Postgres, every bulk-created instance got `id = 0 + i` (garbage).

  Fix: route records through the model constructor (which calls
  `set()` → `prepareValue()`). Use `RETURNING` on Postgres to fetch real
  IDs. Skip the auto-increment PK column from the INSERT column list (its
  value is null in new instances and would violate NOT NULL on SERIAL
  columns).

- **BUG-13: Identifier escaping in find/delete/count/_executeSQL**
  Several query methods interpolated raw `${this.tableName}` /
  `${this.constructor.tableName}` / `${primaryKey}` into SQL. While the
  table name is usually developer-controlled, escaping is cheap insurance
  against future code paths that might pass user input.

  Fix: escape table & PK identifiers in `find()`, `delete()`, `count()`,
  `exists()`, `_executeSQL()`.

- **BUG-14: `static associations = {}` was shared across all subclasses**
  JavaScript `static` field initializers run once on the declaring class
  and are inherited (not re-evaluated) by subclasses. This means every
  model that extends `Model` wrote to the SAME `fields`, `associations`,
  `indexes`, and `options` objects. Defining `User.hasMany(Post, { as:
  'posts' })` and later `Tag.morphedByMany(Post, { as: 'posts' })` would
  silently OVERWRITE `User.associations.posts` (and vice versa) — the last
  definition won. This is a critical design bug that made any application
  with multiple models using the same `as` name silently broken.

  Fix: replace `static fields = {}` / `static associations = {}` / etc.
  with static getters that lazily create a per-class storage object
  (`this._fields`, `this._associations`, etc.) on first access. Each
  subclass now gets its own object.

- **BUG-15: insert() fallback path used ? placeholders on Postgres**
  The catch block in `insert()` (meant for MySQL variants that don't
  support RETURNING) used `?` placeholders unconditionally and didn't
  escape identifiers. On Postgres, the fallback would always fail with
  `syntax error at or near "?"`.

  Fix: build the correct placeholder form per adapter and escape all
  identifiers in the fallback path too.

### Other changes

- **package.json**: bumped to `2.1.0`, added `@electric-sql/pglite` as a
  dev dependency for running the test suite without a Postgres server.
- **pglite-pg-shim.js**: new file. Provides a `pg`-compatible API backed
  by PGlite (real PostgreSQL compiled to WASM) so the test suite can run
  anywhere without needing a Postgres server install.
- **tests/**: new directory with `helpers.js`, `unit.test.js`,
  `integration.test.js`, `performance.test.js`, and `runner.js`. 51 tests
  total, all passing against real PostgreSQL.
- All code patches are clearly marked with `[FIX v2.1.0 - BUG-XX]`
  comments so the changes are auditable.

### Test results (v2.1.0)

```
=== UltraORM v2.1.0 Test Suite ===

Unit Tests:           34 passed, 0 failed
Integration Tests:    13 passed, 0 failed
Performance Tests:     4 passed, 0 failed
                     -------------------
Total:                51 passed, 0 failed

Benchmark highlights (PGlite, in-process):
  SELECT by PK:              avg 0.54 ms
  Complex 4-way JOIN:        avg 1.05 ms
  Transaction (5 stmts):     avg 3.00 ms
  Eager load (3 relations):  avg 2.47 ms
  bulkCreate 10 users:       avg 5.77 ms
```

### Migration guide (v2.0.0 → v2.1.0)

v2.1.0 is **API-compatible** with v2.0.0. No application code changes are
required to upgrade. The fixes are all internal.

However, if your v2.0.0 application:
- Used `MoneyField` — your stored values may be wrong by a factor of 100.
  Audit your data and re-prepare values before upgrading.
- Relied on `belongsToMany` include() returning `[]` as a "no relations"
  sentinel — verify your application logic; include() now correctly
  returns the related records.
- Relied on `morphToMany` / `morphedByMany` doing nothing — these now
  load relations correctly. Remove any workarounds.
- Had multiple models with the same `as` name in associations — these
  were silently overwriting each other in v2.0.0. Each model now has its
  own associations map, so all definitions are preserved.

### Known limitations (still present in v2.1.0)

- **Migration system is `CREATE TABLE IF NOT EXISTS` only.** No ALTER
  TABLE, no column-add. Schema evolution requires manual SQL. This is a
  missing feature, not a bug — not changed in v2.1.0.
- **Polymorphic `morphTo` inverse loading** (`Comment.morphTo({ as:
  'commentable' })`) is implemented but not heavily tested — it relies on
  `orm.model(type)` which looks up models by table name. Verify it works
  for your use case.
- **No query logging hook.** There's still no way to see what SQL
  UltraORM is generating without patching `DBAdapter.execute`. A future
  release will add `orm.onQuery((sql, params, ms) => ...)`.

---

## [2.0.0] — Original release

Initial public release. Contains the bugs documented above; do not use in
production. Upgrade to v2.1.0 immediately.
