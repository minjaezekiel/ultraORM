# UltraORM v2.1.0

The Ultimate Node.js ORM — write once, run anywhere. PostgreSQL, MySQL, and
MongoDB support with Django-like ease.

> **v2.1.0** is a critical bug-fix release. v2.0.0 had four silent
> data-loss bugs that blocked production deployment on PostgreSQL. See
> [CHANGELOG.md](./CHANGELOG.md) for the full list of fixes.

## Quick start

```js
const { UltraORM, Model, StringField, IntegerField, ForeignKey } = require('ultraorm');

class User extends Model {}
User.tableName = 'users';
User.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ maxLength: 100, nullable: false }),
  email: new StringField({ unique: true, nullable: false }),
};

const orm = new UltraORM({
  type: 'postgres',  // or 'mysql' or 'mongodb'
  host: 'localhost',
  database: 'mydb',
  user: 'user',
  password: 'password',
});

await orm.connect();
orm.registerModel(User);
await orm.migrate();

const user = new User({ name: 'Alice', email: 'alice@example.com' });
await user.save();

const found = await User.query().where({ email: 'alice@example.com' }).first();
console.log(found.get('name'));  // 'Alice'
```

## Installation

```bash
npm install ultraorm
# or
bun add ultraorm
```

Peer dependencies (install the one matching your database):
```bash
npm install pg        # PostgreSQL
npm install mysql2    # MySQL
npm install mongodb   # MongoDB
```

## Running the test suite

The test suite uses [PGlite](https://github.com/electric-sql/pglite) (real
PostgreSQL compiled to WebAssembly) so it runs anywhere without needing a
Postgres server install.

```bash
npm install
npm test
```

Or run individual suites:
```bash
npm run test:unit          # 34 tests — one per bug fix + regressions
npm run test:integration   # 13 tests — end-to-end scenarios
npm run test:performance   # 4 tests + 13 micro-benchmarks
```

## What's new in v2.1.0

Fifteen bugs fixed (4 critical, 5 major, 6 minor). All fixes are
documented inline with `[FIX v2.1.0 - BUG-XX]` comments and verified by
51 automated tests. See [CHANGELOG.md](./CHANGELOG.md) for the full
details.

### Critical fixes
- **BUG-01**: PRIMARY KEY now emitted on SERIAL columns (was blocking all FKs on Postgres)
- **BUG-02**: EnumField creates named pg type instead of MySQL-style inline ENUM
- **BUG-03**: Model constructor no longer re-prepares DB values (was corrupting MoneyField)
- **BUG-04**: belongsToMany eager loading now uses `.get()` (was silently returning `[]`)

### Major fixes
- **BUG-05**: morphToMany / morphedByMany loaders implemented (were defined but never dispatched)
- **BUG-06**: hasManyThrough now has a dedicated loader (was reusing belongsToMany code)
- **BUG-07**: update() builds correct `$N` placeholders for Postgres
- **BUG-08**: insertReturning escapes identifiers and routes through execute()
- **BUG-14**: `static associations` is now per-class (was shared across all subclasses — last definition won)

### Minor fixes
- **BUG-10**: All emojis stripped from console.log output
- **BUG-11**: belongsToMany raw SQL path escapes identifiers
- **BUG-12**: bulkCreate calls prepareValue via constructor, uses RETURNING on Postgres
- **BUG-13**: Identifier escaping in find/delete/count/exists/_executeSQL
- **BUG-15**: insert() fallback path uses correct placeholders per adapter

## License

MIT © Silivestir Assey, Ezekiel Minja. v2.1.0 fixes by Z.ai Test Harness.
