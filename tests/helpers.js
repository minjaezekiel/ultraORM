/**
 * UltraORM v2.1.0 - Test Helpers
 * --------------------------------
 * Shared infrastructure for the test suite:
 *   - installPgShim(): substitutes a pg-PGlite shim so all tests run against
 *     real PostgreSQL without needing a Postgres server install.
 *   - setupOrm(): returns a fresh ORM + DB, with all tables dropped.
 *   - defineTestModels(): defines a self-contained set of models exercising
 *     every relationship type UltraORM claims to support.
 *
 * Used by tests/unit.test.js, tests/integration.test.js, tests/performance.test.js
 */
const path = require('path');
const fs = require('fs');

// PGlite shim — must be installed BEFORE requiring UltraORM.
const { installPgShim, getPglite } = require('../pglite-pg-shim');
installPgShim();

const Core = require('../core');
const {
  UltraORM,
  Model,
  IntegerField,
  BigIntegerField,
  SmallIntegerField,
  DecimalField,
  StringField,
  TextField,
  DateTimeField,
  BooleanField,
  JSONField,
  EmailField,
  EnumField,
  ForeignKey,
  OneToOneField,
  MoneyField,
  MoneyValue,
  ValidationError,
  NotFoundError,
  DatabaseError,
  UltraORMError,
} = Core;

// PGlite data directory — wiped between test runs.
const PGLITE_DATA_DIR = path.join(__dirname, '..', '.pglite-test-data');

// Singleton ORM instance shared across tests.
let _orm = null;
let _modelsDefined = false;

async function setupOrm() {
  if (_orm) {
    // Already initialized — just return the existing instance.
    // Tests that need a clean DB should call resetDatabase() explicitly.
    return _orm;
  }

  _orm = new UltraORM({
    type: 'postgres',
    host: 'localhost',
    database: 'ultraorm_test',
    user: 'postgres',
    password: 'postgres',
    poolSize: 5,
  });
  await _orm.connect();
  defineTestModels(_orm);
  await _orm.migrate();
  return _orm;
}

async function resetDatabase() {
  if (!_orm) return;
  // Drop every table we know about, then re-migrate.
  const tables = [
    'taggables', 'tags', 'comments', 'videos', 'posts',
    'user_roles', 'roles', 'profiles', 'addresses', 'countries', 'users',
    'categories',
    // money_test tables
    'wallets', 'invoices',
  ];
  for (const t of tables) {
    try {
      await _orm.adapter.execute(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    } catch (e) {
      // ignore
    }
  }
  // Drop enum types too
  try {
    const { rows } = await _orm.adapter.execute(
      `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'`
    );
    for (const r of rows) {
      try { await _orm.adapter.execute(`DROP TYPE IF EXISTS ${r.typname} CASCADE;`); } catch (e) {}
    }
  } catch (e) {}

  await _orm.migrate();
}

function defineTestModels(orm) {
  if (_modelsDefined) return;
  _modelsDefined = true;

  // 1. User - base model
  class User extends Model {}
  User.tableName = 'users';
  User.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 100, nullable: false }),
    email: new EmailField({ unique: true, nullable: false }),
    role: new EnumField({ values: ['customer', 'admin', 'superadmin'], default: 'customer' }),
    age: new IntegerField({ nullable: true, min: 0, max: 150 }),
    is_active: new BooleanField({ default: true }),
    country_id: new IntegerField({ nullable: true }),
    created_at: new DateTimeField({ autoNowAdd: true }),
    updated_at: new DateTimeField({ autoNow: true }),
  };

  // 2. Address - hasMany
  class Address extends Model {}
  Address.tableName = 'addresses';
  Address.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    user_id: new ForeignKey(User, { nullable: false }),
    label: new StringField({ maxLength: 60 }),
    street: new StringField({ maxLength: 200, nullable: false }),
    city: new StringField({ maxLength: 80, nullable: false }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 3. Profile - hasOne (1:1)
  class Profile extends Model {}
  Profile.tableName = 'profiles';
  Profile.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    user_id: new OneToOneField(User, { unique: true, nullable: false }),
    bio: new TextField({}),
    avatar: new StringField({ maxLength: 200 }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 4. Country - for hasManyThrough
  class Country extends Model {}
  Country.tableName = 'countries';
  Country.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 80, unique: true, nullable: false }),
    code: new StringField({ maxLength: 2, unique: true }),
  };

  // 5. Post - belongsTo User, hasMany Comments, morphToMany Tags
  class Post extends Model {}
  Post.tableName = 'posts';
  Post.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    title: new StringField({ maxLength: 200, nullable: false }),
    body: new TextField({}),
    user_id: new ForeignKey(User, { nullable: false }),
    country_id: new IntegerField({ nullable: true }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 6. Comment - polymorphic (morphTo), belongsTo User
  class Comment extends Model {}
  Comment.tableName = 'comments';
  Comment.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    body: new TextField({ nullable: false }),
    commentable_type: new StringField({ maxLength: 60, nullable: false }),
    commentable_id: new IntegerField({ nullable: false }),
    user_id: new ForeignKey(User, { nullable: false }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 7. Video - another polymorphic target for Comment
  class Video extends Model {}
  Video.tableName = 'videos';
  Video.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    title: new StringField({ maxLength: 200, nullable: false }),
    url: new StringField({ maxLength: 500, nullable: false }),
    user_id: new ForeignKey(User, { nullable: false }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 8. Role - M:N with User
  class Role extends Model {}
  Role.tableName = 'roles';
  Role.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 60, unique: true, nullable: false }),
  };

  // 9. UserRole - junction
  class UserRole extends Model {}
  UserRole.tableName = 'user_roles';
  UserRole.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    user_id: new ForeignKey(User, { nullable: false }),
    role_id: new ForeignKey(Role, { nullable: false }),
    assigned_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 10. Tag - polymorphic M:N
  class Tag extends Model {}
  Tag.tableName = 'tags';
  Tag.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 60, unique: true, nullable: false }),
  };

  // 11. Taggable - polymorphic junction
  class Taggable extends Model {}
  Taggable.tableName = 'taggables';
  Taggable.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    tag_id: new ForeignKey(Tag, { nullable: false }),
    taggable_type: new StringField({ maxLength: 60, nullable: false }),
    taggable_id: new IntegerField({ nullable: false }),
  };

  // 12. Category - self-referential
  class Category extends Model {}
  Category.tableName = 'categories';
  Category.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 80, nullable: false }),
    parent_id: new IntegerField({ nullable: true }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 13. Wallet - tests MoneyField
  class Wallet extends Model {}
  Wallet.tableName = 'wallets';
  Wallet.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    user_id: new ForeignKey(User, { nullable: false }),
    balance: new MoneyField({ currency: 'USD' }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // 14. Invoice - tests MoneyField + DecimalField
  class Invoice extends Model {}
  Invoice.tableName = 'invoices';
  Invoice.fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    user_id: new ForeignKey(User, { nullable: false }),
    amount: new MoneyField({ currency: 'USD' }),
    tax_rate: new DecimalField({ precision: 5, scale: 4, default: 0.08 }),
    created_at: new DateTimeField({ autoNowAdd: true }),
  };

  // ====== RELATIONSHIPS ======
  User.hasMany(Address, { foreignKey: 'user_id', as: 'addresses' });
  User.hasOne(Profile, { foreignKey: 'user_id', as: 'profile' });
  User.hasMany(Post, { foreignKey: 'user_id', as: 'posts' });
  User.belongsTo(Country, { foreignKey: 'country_id', as: 'country' });
  User.belongsToMany(Role, {
    through: UserRole, foreignKey: 'user_id', otherKey: 'role_id', as: 'roles',
  });

  Address.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  Profile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  // hasManyThrough: Country has many Posts through User
  Country.hasManyThrough(Post, {
    through: User,
    foreignKey: 'country_id',  // on User, points to Country
    throughKey: 'id',          // on User, used to match Post.user_id
    targetKey: 'user_id',      // on Post, points to User
    as: 'posts_through_users',
  });
  // Country.hasMany(User, ...) is implicit — User has country_id FK.
  Country.hasMany(User, { foreignKey: 'country_id', as: 'users' });

  Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
  Post.belongsTo(Country, { foreignKey: 'country_id', as: 'country' });
  Post.morphMany(Comment, { morphName: 'commentable', as: 'comments' });
  Post.morphToMany(Tag, {
    through: Taggable, morphName: 'taggable',
    foreignKey: 'tag_id', as: 'tags',
  });

  Video.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
  Video.morphMany(Comment, { morphName: 'commentable', as: 'comments' });
  Video.morphToMany(Tag, {
    through: Taggable, morphName: 'taggable',
    foreignKey: 'tag_id', as: 'tags',
  });

  Comment.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
  Comment.morphTo({ as: 'commentable' });

  Tag.morphedByMany(Post, {
    through: Taggable, morphName: 'taggable',
    foreignKey: 'tag_id', as: 'posts',
  });
  Tag.morphedByMany(Video, {
    through: Taggable, morphName: 'taggable',
    foreignKey: 'tag_id', as: 'videos',
  });

  // Self-referential
  Category.belongsTo(Category, { foreignKey: 'parent_id', as: 'parent' });
  Category.hasMany(Category, { foreignKey: 'parent_id', as: 'children' });

  Wallet.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  Invoice.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  // Register all
  const allModels = [
    User, Address, Profile, Country, Post, Comment, Video, Role, UserRole,
    Tag, Taggable, Category, Wallet, Invoice,
  ];
  for (const m of allModels) orm.registerModel(m);

  // Expose via module-level export
  module.exports._Models = {
    User, Address, Profile, Country, Post, Comment, Video, Role, UserRole,
    Tag, Taggable, Category, Wallet, Invoice,
  };
}

// ====== TEST RUNNER UTILITIES ======

const PASS = '[OK]';
const FAIL = '[FAIL]';
const SKIP = '[SKIP]';

const _results = [];

async function test(name, fn) {
  try {
    await fn();
    _results.push({ name, status: 'pass' });
    console.log(`  ${PASS} ${name}`);
  } catch (err) {
    _results.push({ name, status: 'fail', error: err.message, stack: err.stack });
    console.log(`  ${FAIL} ${name}`);
    console.log(`         ${err.message}`);
    if (process.env.DEBUG) {
      console.log(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

async function skip(name, reason) {
  _results.push({ name, status: 'skip', reason });
  console.log(`  ${SKIP} ${name}  (${reason})`);
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function expectEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectReject(promise, msg) {
  return promise.then(
    () => { throw new Error(msg || 'Expected promise to reject, but it resolved'); },
    (err) => err // expected
  );
}

function getResults() {
  return _results.slice();
}

function printSummary(suiteName) {
  const passed = _results.filter((r) => r.status === 'pass').length;
  const failed = _results.filter((r) => r.status === 'fail').length;
  const skipped = _results.filter((r) => r.status === 'skip').length;
  console.log('');
  console.log(`  ${suiteName} Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('');
  return { passed, failed, skipped };
}

const _exports = {
  Core,
  setupOrm,
  resetDatabase,
  test,
  skip,
  expect,
  expectEqual,
  expectReject,
  getResults,
  printSummary,
  PASS, FAIL, SKIP,
};

// Lazy Models accessor — populated by defineTestModels() at setupOrm() time.
Object.defineProperty(_exports, 'Models', {
  get() { return module.exports._Models || {}; },
  configurable: true,
});

// Define a setter so defineTestModels() can populate it.
Object.defineProperty(_exports, '_Models', {
  value: {},
  writable: true,
  configurable: true,
});

module.exports = _exports;
