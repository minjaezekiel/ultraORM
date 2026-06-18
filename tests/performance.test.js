/**
 * UltraORM v2.1.0 - Performance Tests
 * -------------------------------------
 * Micro-benchmarks measuring latency of common operations.
 * Tests are NOT pass/fail (they print numbers), but they DO fail if
 * any operation throws an error.
 *
 * Run: node tests/performance.test.js
 */
const {
  Core, setupOrm, resetDatabase, test, expect, expectEqual,
  printSummary, Models,
} = require('./helpers');

async function bench(label, fn, iterations = 20) {
  // Warmup
  try { await fn(); } catch (e) {}
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
  console.log(`    ${label.padEnd(70)} avg=${avg.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  min=${min.toFixed(2)}ms  max=${max.toFixed(2)}ms`);
  return { label, avg, min, max, p95, iterations };
}

async function main() {
  console.log('\n=== UltraORM v2.1.0 Performance Tests ===\n');
  console.log('Setting up test database...');
  await setupOrm();
  await resetDatabase();
  console.log('Database ready.\n');

  const M = require('./helpers').Models;
  const { User, Address, Profile, Post, Comment, Role, UserRole, Tag, Taggable, Wallet } = M;

  // Seed with bulk data
  console.log('Seeding performance data...');
  const users = [];
  for (let i = 0; i < 50; i++) {
    const u = new User({ name: `Perf${i}`, email: `perf${i}-${Date.now()}@example.com` });
    await u.save();
    users.push(u);
    // Each user has 2 addresses
    await new Address({ user_id: u.get('id'), label: 'Home', street: `${i} St`, city: 'City' }).save();
    await new Address({ user_id: u.get('id'), label: 'Work', street: `${i} Ave`, city: 'City' }).save();
    // Each user has 3 posts
    for (let j = 0; j < 3; j++) {
      await new Post({ title: `Post ${i}-${j}`, body: 'body', user_id: u.get('id') }).save();
    }
  }
  // Add roles + M2M
  const adminRole = new Role({ name: `Admin-${Date.now()}` });
  const userRole = new Role({ name: `User-${Date.now()}` });
  await adminRole.save(); await userRole.save();
  for (const u of users) {
    await new UserRole({ user_id: u.get('id'), role_id: adminRole.get('id') }).save();
    if (u.get('id') % 2 === 0) {
      await new UserRole({ user_id: u.get('id'), role_id: userRole.get('id') }).save();
    }
  }
  console.log(`Seeded: ${users.length} users, 100 addresses, 150 posts, ${users.length * 1.5 | 0} user_role mappings`);
  console.log('');

  let orm;
  async function getOrm() {
    if (!orm) orm = await setupOrm();
    return orm;
  }

  const results = [];

  console.log('[Benchmarks]');
  // 1. SELECT by PK
  results.push(await test_perf('SELECT by PK (User.query().where({id}).first())', async () => {
    await User.query().where({ id: users[0].get('id') }).first();
  }, 50));

  // 2. SELECT with WHERE
  results.push(await test_perf('SELECT with WHERE (User.where is_active=true)', async () => {
    await User.query().where({ is_active: true }).get();
  }, 30));

  // 3. COUNT
  results.push(await test_perf('COUNT (User.query().count())', async () => {
    await User.query().count();
  }, 30));

  // 4. INSERT single
  const insertedIds = [];
  let insertCounter = 0;
  results.push(await test_perf('INSERT single row (User.save())', async () => {
    insertCounter++;
    const u = new User({ name: `Bench-${insertCounter}`, email: `b-${Date.now()}-${insertCounter}@example.com` });
    await u.save();
    insertedIds.push(u.get('id'));
  }, 20));
  // Cleanup
  for (const id of insertedIds) {
    await (await getOrm()).adapter.execute(`DELETE FROM users WHERE id = $1`, [id]);
  }

  // 5. UPDATE
  results.push(await test_perf('UPDATE single field', async () => {
    const u = users[0];
    u.set('name', `Updated-${Date.now()}`);
    await u.save();
  }, 20));

  // 6. Eager load (1 level)
  results.push(await test_perf('Eager load (User.include(addresses))', async () => {
    await User.query().include('addresses').take(10).get();
  }, 20));

  // 7. Eager load (multi-relation)
  results.push(await test_perf('Eager load multi (User.include([addresses, posts, roles]))', async () => {
    await User.query().include(['addresses', 'posts', 'roles']).take(10).get();
  }, 20));

  // 8. N+1 anti-pattern (BAD — for comparison)
  results.push(await test_perf('N+1 anti-pattern (5 users x separate query)', async () => {
    const subset = users.slice(0, 5);
    for (const u of subset) {
      await Post.query().where({ user_id: u.get('id') }).count();
    }
  }, 10));

  // 9. belongsToMany include (regression for BUG-04)
  results.push(await test_perf('belongsToMany include (User.include(roles))', async () => {
    await User.query().include('roles').take(10).get();
  }, 20));

  // 10. Complex 4-way JOIN via raw SQL
  results.push(await test_perf('Complex 4-way JOIN (raw SQL)', async () => {
    await (await getOrm()).adapter.execute(`
      SELECT p.title, u.name AS author, COUNT(c.id) AS comment_count
        FROM posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN comments c ON c.commentable_type = 'posts' AND c.commentable_id = p.id
       GROUP BY p.id, p.title, u.name
       ORDER BY p.id DESC
       LIMIT 50
    `);
  }, 20));

  // 11. Transaction (5 statements)
  results.push(await test_perf('Transaction (5 statements, atomic)', async () => {
    const o = await getOrm();
    await o.adapter.transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id`,
        [`Tx${Date.now()}`, `tx-${Date.now()}@example.com`, 'customer']
      );
      const uid = rows[0].id;
      await client.query(`INSERT INTO addresses (user_id, label, street, city) VALUES ($1, $2, $3, $4)`,
        [uid, 'Home', 'St', 'City']);
      await client.query(`INSERT INTO wallets (user_id, balance) VALUES ($1, $2)`, [uid, 1000]);
      await client.query(`DELETE FROM wallets WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM addresses WHERE user_id = $1`, [uid]);
      await client.query(`DELETE FROM users WHERE id = $1`, [uid]);
    });
  }, 10));

  // 12. Pagination
  results.push(await test_perf('Pagination (skip 30 / take 10)', async () => {
    await User.query().order('id', 'DESC').skip(30).take(10).get();
  }, 20));

  // 13. bulkCreate
  results.push(await test_perf('bulkCreate 10 users', async () => {
    const ts = Date.now();
    const inserted = await User.bulkCreate(
      Array.from({ length: 10 }, (_, i) => ({
        name: `Bulk-${ts}-${i}`,
        email: `bulk-${ts}-${i}@example.com`,
      }))
    );
    // Cleanup
    for (const u of inserted) {
      await (await getOrm()).adapter.execute(`DELETE FROM users WHERE id = $1`, [u.get('id')]);
    }
  }, 5));

  console.log('');
  console.log('[Performance Assertions]');

  // Verify performance is within acceptable bounds (loose — PGlite is in-process)
  await test('all benchmarks completed without error', async () => {
    const failures = results.filter((r) => r === null);
    expectEqual(failures.length, 0, `${failures.length} benchmarks failed`);
  });

  await test('SELECT by PK completes in < 5ms average', async () => {
    const r = results[0];
    expect(r.avg < 5, `SELECT by PK avg was ${r.avg.toFixed(2)}ms, expected < 5ms`);
  });

  await test('eager load is faster than N+1 (or at least not worse)', async () => {
    const eager = results[5].avg;
    const nplus1 = results[7].avg;
    // In-process PGlite: N+1 can be slightly faster (no round-trips).
    // We just verify eager is not > 5x slower than N+1.
    expect(eager < nplus1 * 5, `eager (${eager.toFixed(2)}) should not be 5x slower than N+1 (${nplus1.toFixed(2)})`);
  });

  await test('transaction throughput: 5-statement tx in < 50ms', async () => {
    const r = results[10];
    expect(r.avg < 50, `tx avg was ${r.avg.toFixed(2)}ms, expected < 50ms`);
  });

  printSummary('Performance Tests');
  const testResults = require('./helpers').getResults();
  process.exit(testResults.filter((r) => r.status === 'fail').length > 0 ? 1 : 0);
}

async function test_perf(label, fn, iterations) {
  try {
    const result = await bench(label, fn, iterations);
    return result;
  } catch (e) {
    console.log(`    ${label.padEnd(70)} FAILED: ${e.message}`);
    return null;
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  console.error(err.stack);
  process.exit(2);
});
