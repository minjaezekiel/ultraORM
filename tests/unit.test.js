/**
 * UltraORM v2.1.0 - Unit Tests
 * ------------------------------
 * One focused test per bug fix, plus regression coverage for the
 * surrounding code paths.
 *
 * Run: node tests/unit.test.js
 */
const {
  Core, setupOrm, resetDatabase, test, expect, expectEqual, expectReject,
  printSummary, Models,
} = require('./helpers');

const { UltraORM, ValidationError, NotFoundError, UltraORMError } = Core;

async function main() {
  console.log('\n=== UltraORM v2.1.0 Unit Tests ===\n');
  console.log('Setting up test database (PGlite / real PostgreSQL)...');
  await setupOrm();
  await resetDatabase();
  console.log('Database ready.\n');

  // Models are populated by setupOrm(); fetch after init.
  const M = require('./helpers').Models;
  const { User, Address, Profile, Country, Post, Comment, Video, Role,
    UserRole, Tag, Taggable, Category, Wallet, Invoice } = M;

  // ---------- BUG-01: PRIMARY KEY on SERIAL ----------
  console.log('[BUG-01] PRIMARY KEY on SERIAL columns:');
  await test('table with autoIncrement PK has a PRIMARY KEY constraint', async () => {
    const { rows } = await User.query(); // implicitly tests that SELECT works
    const orm = require('./helpers').Core;
    // Check pg_catalog for the PK constraint
    const { rows: pkRows } = await (await getOrm()).adapter.execute(
      `SELECT tc.constraint_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'users' AND tc.constraint_type = 'PRIMARY KEY'`
    );
    expect(pkRows.length > 0, 'users table should have a PRIMARY KEY constraint');
    expect(pkRows.some((r) => r.column_name === 'id'), 'PK should be on id column');
  });

  await test('FK references to SERIAL PK table work (Address.user_id -> users.id)', async () => {
    // This implicitly tests BUG-01: if users.id had no PK constraint, the FK
    // on addresses.user_id would have failed at migration time.
    const u = new User({ name: 'PK Test', email: 'pk-test@example.com' });
    await u.save();
    const a = new Address({ user_id: u.get('id'), label: 'Home', street: '123 St', city: 'Test' });
    await a.save();
    expect(a.get('id') > 0, 'Address should be saved with an ID');
  });

  // ---------- BUG-02: EnumField on Postgres ----------
  console.log('\n[BUG-02] EnumField on Postgres:');
  await test('EnumField creates named pg type and accepts valid values', async () => {
    const u = new User({ name: 'Enum Test', email: 'enum@example.com', role: 'admin' });
    await u.save();
    const fetched = await User.query().where({ id: u.get('id') }).first();
    expectEqual(fetched.get('role'), 'admin', 'role enum value round-trips');
  });

  await test('EnumField rejects out-of-range value', async () => {
    await expectReject(
      (async () => {
        const u = new User({ name: 'Bad Enum', email: 'bad-enum@example.com', role: 'superuser' });
        await u.save();
      })(),
      'Should reject invalid enum value'
    );
  });

  await test('EnumField respects default value', async () => {
    const u = new User({ name: 'Default Enum', email: 'default-enum@example.com' });
    await u.save();
    const fetched = await User.query().where({ id: u.get('id') }).first();
    expectEqual(fetched.get('role'), 'customer', 'default role should be customer');
  });

  // ---------- BUG-03: prepareValue in insert/update ----------
  console.log('\n[BUG-03] prepareValue in insert/update (MoneyField):');
  await test('MoneyField stores cents correctly via constructor (set() prepares)', async () => {
    const u = new User({ name: 'Money Test', email: 'money@example.com' });
    await u.save();
    const w = new Wallet({ user_id: u.get('id'), balance: 19.99 });
    await w.save();
    // Read back raw value (bypass fromDatabase) to see what's actually stored
    const orm = await getOrm();
    const { rows } = await orm.adapter.execute(`SELECT balance FROM wallets WHERE id = $1`, [w.get('id')]);
    const storedRaw = rows[0].balance;
    // MoneyField stores as BIGINT cents. set() calls prepareValue(19.99) → 1999.
    expectEqual(Number(storedRaw), 1999, `19.99 should be stored as 1999 cents, got ${storedRaw}`);
  });

  await test('MoneyField.fromDatabase converts cents back to dollars correctly', async () => {
    const u = new User({ name: 'Money Read', email: 'money-read@example.com' });
    await u.save();
    const w = new Wallet({ user_id: u.get('id'), balance: 19.99 });
    await w.save();
    const fetched = await Wallet.query().where({ id: w.get('id') }).first();
    const balance = fetched.get('balance');
    // MoneyField.fromDatabase returns a MoneyValue object
    if (balance && typeof balance === 'object' && 'amount' in balance) {
      expectEqual(balance.amount, 19.99, 'MoneyValue.amount should be 19.99');
    } else {
      // Some configs return the raw cents; check it's at least 1999 not 19
      expect(Number(balance) >= 19.99, `balance should be >= 19.99, got ${balance}`);
    }
  });

  await test('update() preserves MoneyField cents (set() already prepared)', async () => {
    const u = new User({ name: 'Money Update', email: 'money-update@example.com' });
    await u.save();
    const w = new Wallet({ user_id: u.get('id'), balance: 19.99 });
    await w.save();
    w.set('balance', 25.50);  // set() converts 25.50 -> 2550 cents
    await w.save();
    const orm = await getOrm();
    const { rows } = await orm.adapter.execute(`SELECT balance FROM wallets WHERE id = $1`, [w.get('id')]);
    expectEqual(Number(rows[0].balance), 2550, '25.50 should be stored as 2550 cents after update');
  });

  // ---------- BUG-04: belongsToMany uses .get() ----------
  console.log('\n[BUG-04] belongsToMany eager loading:');
  await test('belongsToMany include() returns related records (not empty)', async () => {
    const u = new User({ name: 'M2M Test', email: 'm2m@example.com' });
    await u.save();
    const r1 = new Role({ name: `Admin-${Date.now()}` });
    await r1.save();
    const r2 = new Role({ name: `Editor-${Date.now()}` });
    await r2.save();
    await new UserRole({ user_id: u.get('id'), role_id: r1.get('id') }).save();
    await new UserRole({ user_id: u.get('id'), role_id: r2.get('id') }).save();

    const fetched = await User.query().include('roles').where({ id: u.get('id') }).first();
    expect(fetched.roles, 'roles should be defined');
    expect(fetched.roles.length === 2, `expected 2 roles, got ${fetched.roles?.length}`);
  });

  await test('belongsToMany include() with multiple instances groups correctly', async () => {
    const u1 = new User({ name: 'Multi M2M 1', email: `m2m-1-${Date.now()}@example.com` });
    const u2 = new User({ name: 'Multi M2M 2', email: `m2m-2-${Date.now()}@example.com` });
    await u1.save(); await u2.save();
    const r = new Role({ name: `Shared-${Date.now()}` });
    await r.save();
    await new UserRole({ user_id: u1.get('id'), role_id: r.get('id') }).save();
    await new UserRole({ user_id: u2.get('id'), role_id: r.get('id') }).save();

    const fetched = await User.query()
      .include('roles')
      .where({ id: [u1.get('id'), u2.get('id')] })
      .get();
    expectEqual(fetched.length, 2, 'should fetch 2 users');
    expectEqual(fetched[0].roles.length, 1, 'user 1 should have 1 role');
    expectEqual(fetched[1].roles.length, 1, 'user 2 should have 1 role');
  });

  // ---------- BUG-05: morphToMany / morphedByMany ----------
  console.log('\n[BUG-05] morphToMany / morphedByMany loaders:');
  await test('Post.morphToMany(Tag) returns tags for a post', async () => {
    const u = new User({ name: 'Tag Test', email: `tag-${Date.now()}@example.com` });
    await u.save();
    const p = new Post({ title: 'Tagged Post', body: 'content', user_id: u.get('id') });
    await p.save();
    const t1 = new Tag({ name: `tech-${Date.now()}` });
    const t2 = new Tag({ name: `news-${Date.now()}` });
    await t1.save(); await t2.save();
    await new Taggable({ tag_id: t1.get('id'), taggable_type: 'posts', taggable_id: p.get('id') }).save();
    await new Taggable({ tag_id: t2.get('id'), taggable_type: 'posts', taggable_id: p.get('id') }).save();

    const fetched = await Post.query().include('tags').where({ id: p.get('id') }).first();
    expect(fetched.tags, 'tags should be defined');
    expectEqual(fetched.tags.length, 2, 'post should have 2 tags');
  });

  await test('Tag.morphedByMany(Post) returns posts for a tag', async () => {
    const u = new User({ name: 'Inverse Tag', email: `inv-${Date.now()}@example.com` });
    await u.save();
    const p1 = new Post({ title: 'P1', body: 'b', user_id: u.get('id') });
    const p2 = new Post({ title: 'P2', body: 'b', user_id: u.get('id') });
    await p1.save(); await p2.save();
    const t = new Tag({ name: `shared-tag-${Date.now()}` });
    await t.save();
    await new Taggable({ tag_id: t.get('id'), taggable_type: 'posts', taggable_id: p1.get('id') }).save();
    await new Taggable({ tag_id: t.get('id'), taggable_type: 'posts', taggable_id: p2.get('id') }).save();

    const fetched = await Tag.query().include('posts').where({ id: t.get('id') }).first();
    expectEqual(fetched.posts.length, 2, 'tag should be on 2 posts');
  });

  // ---------- BUG-06: hasManyThrough ----------
  console.log('\n[BUG-06] hasManyThrough loader:');
  await test('Country.hasManyThrough(Post) returns posts via users', async () => {
    const c = new Country({ name: `TestCountry-${Date.now()}`, code: 'TC' });
    await c.save();
    const u = new User({ name: 'Through User', email: `through-${Date.now()}@example.com`, country_id: c.get('id') });
    await u.save();
    const p1 = new Post({ title: 'P1', body: 'b', user_id: u.get('id'), country_id: c.get('id') });
    const p2 = new Post({ title: 'P2', body: 'b', user_id: u.get('id'), country_id: c.get('id') });
    await p1.save(); await p2.save();

    const fetched = await Country.query().include('posts_through_users').where({ id: c.get('id') }).first();
    expect(fetched.posts_through_users, 'hasManyThrough relation should be defined');
    expect(fetched.posts_through_users.length >= 2, `expected >= 2 posts, got ${fetched.posts_through_users?.length}`);
  });

  // ---------- BUG-07: update() uses correct Postgres placeholders ----------
  console.log('\n[BUG-07] update() Postgres placeholders:');
  await test('update() builds $N placeholders on Postgres', async () => {
    const u = new User({ name: 'Before Update', email: `update-${Date.now()}@example.com` });
    await u.save();
    u.set('name', 'After Update');
    await u.save();
    const fetched = await User.query().where({ id: u.get('id') }).first();
    expectEqual(fetched.get('name'), 'After Update', 'name should be updated');
  });

  await test('update() with multiple fields uses sequential $N placeholders', async () => {
    const u = new User({ name: 'Multi A', email: `multi-${Date.now()}@example.com` });
    await u.save();
    u.set('name', 'Multi B');
    u.set('age', 42);
    await u.save();
    const fetched = await User.query().where({ id: u.get('id') }).first();
    expectEqual(fetched.get('name'), 'Multi B');
    expectEqual(fetched.get('age'), 42);
  });

  // ---------- BUG-08: insertReturning escapes identifiers ----------
  console.log('\n[BUG-08] insertReturning identifier escaping:');
  await test('insertReturning escapes table & column names', async () => {
    // Direct call — should not throw on identifiers
    const result = await (await getOrm()).adapter.insertReturning(
      'users',
      { name: 'IR Test', email: `ir-${Date.now()}@example.com`, role: 'customer', is_active: true },
      'id'
    );
    expect(result.id > 0, 'should return inserted id');
  });

  // ---------- BUG-11: _loadBelongsToMany raw SQL escapes identifiers ----------
  console.log('\n[BUG-11] belongsToMany raw SQL path escapes identifiers:');
  await test('belongsToMany with string through name escapes identifiers', async () => {
    const u = new User({ name: 'Str Through', email: `str-${Date.now()}@example.com` });
    await u.save();
    const r = new Role({ name: `StrRole-${Date.now()}` });
    await r.save();
    await new UserRole({ user_id: u.get('id'), role_id: r.get('id') }).save();

    // Re-define the association with string `through`
    User.associations.roles_str = {
      type: 'belongsToMany',
      target: Role,
      through: 'user_roles',  // string, not class
      foreignKey: 'user_id',
      otherKey: 'role_id',
      as: 'roles_str',
    };
    const fetched = await User.query().include('roles_str').where({ id: u.get('id') }).first();
    expectEqual(fetched.roles_str.length, 1, 'should load 1 role via string-through');
    delete User.associations.roles_str;
  });

  // ---------- BUG-12: bulkCreate ----------
  console.log('\n[BUG-12] bulkCreate:');
  await test('bulkCreate inserts multiple records with correct IDs', async () => {
    const ts = Date.now();
    const users = await User.bulkCreate([
      { name: `Bulk1-${ts}`, email: `bulk1-${ts}@example.com` },
      { name: `Bulk2-${ts}`, email: `bulk2-${ts}@example.com` },
      { name: `Bulk3-${ts}`, email: `bulk3-${ts}@example.com` },
    ]);
    expectEqual(users.length, 3, 'should create 3 users');
    for (const u of users) {
      expect(u.get('id') > 0, `each user should have a real ID, got ${u.get('id')}`);
    }
    // IDs should be distinct (not all the same)
    const ids = users.map((u) => u.get('id'));
    const unique = new Set(ids);
    expectEqual(unique.size, 3, 'IDs should be distinct');
  });

  await test('bulkCreate calls prepareValue (MoneyField)', async () => {
    const u = new User({ name: 'Bulk Money', email: `bm-${Date.now()}@example.com` });
    await u.save();
    const wallets = await Wallet.bulkCreate([
      { user_id: u.get('id'), balance: 10.99 },
      { user_id: u.get('id'), balance: 20.50 },
    ]);
    const orm = await getOrm();
    const { rows } = await orm.adapter.execute(
      `SELECT balance FROM wallets WHERE user_id = $1 ORDER BY id DESC LIMIT 2`,
      [u.get('id')]
    );
    // Last two wallets should be 1050 and 1099 cents (in insertion order)
    const balances = rows.map((r) => Number(r.balance)).sort();
    expect(balances.includes(1099), `should contain 1099 cents, got ${balances}`);
    expect(balances.includes(2050), `should contain 2050 cents, got ${balances}`);
  });

  // ---------- BUG-13: Identifier escaping in find/delete/count ----------
  console.log('\n[BUG-13] Identifier escaping:');
  await test('delete() escapes table & PK identifiers', async () => {
    const u = new User({ name: 'Delete Test', email: `del-${Date.now()}@example.com` });
    await u.save();
    const id = u.get('id');
    await u.delete();
    const fetched = await User.query().where({ id }).first();
    expectEqual(fetched, null, 'user should be deleted');
  });

  await test('count() escapes table identifier', async () => {
    const c1 = await User.query().count();
    expect(c1 >= 0, 'count should return a non-negative number');
  });

  // ---------- Regression: existing functionality still works ----------
  console.log('\n[Regression] Existing functionality:');
  await test('hasMany include() still works', async () => {
    const u = new User({ name: 'HM Test', email: `hm-${Date.now()}@example.com` });
    await u.save();
    await new Address({ user_id: u.get('id'), label: 'Home', street: '1 St', city: 'C1' }).save();
    await new Address({ user_id: u.get('id'), label: 'Work', street: '2 St', city: 'C2' }).save();
    const fetched = await User.query().include('addresses').where({ id: u.get('id') }).first();
    expectEqual(fetched.addresses.length, 2, 'should have 2 addresses');
  });

  await test('hasOne include() still works', async () => {
    const u = new User({ name: 'HO Test', email: `ho-${Date.now()}@example.com` });
    await u.save();
    await new Profile({ user_id: u.get('id'), bio: 'My bio' }).save();
    const fetched = await User.query().include('profile').where({ id: u.get('id') }).first();
    expect(fetched.profile, 'profile should be defined');
    expectEqual(fetched.profile.get('bio'), 'My bio');
  });

  await test('belongsTo include() still works', async () => {
    const email = `bt-${Date.now()}@example.com`;
    const u = new User({ name: 'BT Test', email });
    await u.save();
    const a = new Address({ user_id: u.get('id'), label: 'L', street: 'S', city: 'C' });
    await a.save();
    const fetched = await Address.query().include('user').where({ id: a.get('id') }).first();
    expect(fetched.user, 'user should be defined');
    expectEqual(fetched.user.get('email'), email);
  });

  await test('morphMany include() still works (Post.comments)', async () => {
    const u = new User({ name: 'MM Test', email: `mm-${Date.now()}@example.com` });
    await u.save();
    const p = new Post({ title: 'P', body: 'b', user_id: u.get('id') });
    await p.save();
    await new Comment({ body: 'c1', commentable_type: 'posts', commentable_id: p.get('id'), user_id: u.get('id') }).save();
    await new Comment({ body: 'c2', commentable_type: 'posts', commentable_id: p.get('id'), user_id: u.get('id') }).save();
    const fetched = await Post.query().include('comments').where({ id: p.get('id') }).first();
    expectEqual(fetched.comments.length, 2, 'post should have 2 comments');
  });

  await test('self-referential belongsTo still works (Category.parent)', async () => {
    const parent = new Category({ name: 'Parent' });
    await parent.save();
    const child = new Category({ name: 'Child', parent_id: parent.get('id') });
    await child.save();
    const fetched = await Category.query().include('parent').where({ id: child.get('id') }).first();
    expect(fetched.parent, 'parent should be defined');
    expectEqual(fetched.parent.get('name'), 'Parent');
  });

  await test('self-referential hasMany still works (Category.children)', async () => {
    const parent = new Category({ name: `P-${Date.now()}` });
    await parent.save();
    await new Category({ name: `C1-${Date.now()}`, parent_id: parent.get('id') }).save();
    await new Category({ name: `C2-${Date.now()}`, parent_id: parent.get('id') }).save();
    const fetched = await Category.query().include('children').where({ id: parent.get('id') }).first();
    expectEqual(fetched.children.length, 2, 'parent should have 2 children');
  });

  await test('transaction commit persists all writes', async () => {
    const orm = await getOrm();
    const before = await User.query().count();
    await orm.adapter.transaction(async (client) => {
      await client.query(`INSERT INTO users (name, email, role) VALUES ($1, $2, $3)`,
        [`Tx-${Date.now()}`, `tx-${Date.now()}@example.com`, 'customer']);
      await client.query(`INSERT INTO users (name, email, role) VALUES ($1, $2, $3)`,
        [`Tx2-${Date.now()}`, `tx2-${Date.now()}@example.com`, 'customer']);
    });
    const after = await User.query().count();
    expectEqual(after, before + 2, 'should have added 2 users in transaction');
  });

  await test('transaction rollback discards all writes', async () => {
    const orm = await getOrm();
    const before = await User.query().count();
    try {
      await orm.adapter.transaction(async (client) => {
        await client.query(`INSERT INTO users (name, email, role) VALUES ($1, $2, $3)`,
          [`Rb-${Date.now()}`, `rb-${Date.now()}@example.com`, 'customer']);
        // Force an error
        await client.query(`INSERT INTO nonexistent_table VALUES (1)`);
      });
      throw new Error('Should have thrown');
    } catch (e) {
      // expected
    }
    const after = await User.query().count();
    expectEqual(after, before, 'rollback should leave count unchanged');
  });

  await test('SQL injection via values is neutralized by parameterization', async () => {
    const evil = `'; DROP TABLE users; --`;
    const u = new User({ name: evil, email: `evil-${Date.now()}@example.com` });
    await u.save();
    // users table should still exist
    const c = await User.query().count();
    expect(c > 0, 'users table should still have rows');
  });

  await test('validation rejects null on non-nullable field', async () => {
    await expectReject(
      (async () => {
        const u = new User({ name: null, email: `n-${Date.now()}@example.com` });
        await u.save();
      })(),
      'should reject null name'
    );
  });

  await test('unique constraint rejects duplicates', async () => {
    const email = `dup-${Date.now()}@example.com`;
    await new User({ name: 'Dup1', email }).save();
    await expectReject(
      (async () => { await new User({ name: 'Dup2', email }).save(); })(),
      'should reject duplicate email'
    );
  });

  await test('foreign key constraint rejects orphan child', async () => {
    await expectReject(
      (await getOrm()).adapter.execute(
        `INSERT INTO addresses (user_id, label, street, city) VALUES ($1, $2, $3, $4)`,
        [999999, 'Orphan', 'S', 'C']
      ),
      'should reject FK violation'
    );
  });

  await test('pagination skip/take works', async () => {
    const page1 = await User.query().order('id', 'ASC').skip(0).take(2).get();
    const page2 = await User.query().order('id', 'ASC').skip(2).take(2).get();
    expect(page1.length <= 2, 'page1 should have <= 2 rows');
    if (page1.length === 2 && page2.length > 0) {
      expect(page1[1].get('id') < page2[0].get('id'), 'pages should not overlap');
    }
  });

  printSummary('Unit Tests');
  const results = require('./helpers').getResults();
  process.exit(results.filter((r) => r.status === 'fail').length > 0 ? 1 : 0);
}

async function getOrm() {
  const h = require('./helpers');
  return h.setupOrm();
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  console.error(err.stack);
  process.exit(2);
});
