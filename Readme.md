# UltraORM v2.1.0

> **Write once, run anywhere** — a Django-inspired Node.js ORM that speaks
> PostgreSQL, MySQL, and MongoDB through one consistent, chainable API.

UltraORM gives you a single, opinionated way to model your data, define
relationships, run complex queries, and manage transactions — and lets you
swap the underlying database without rewriting application code. It is
designed for teams that want the ergonomics of Django's ORM or Laravel
Eloquent in a plain Node.js package, with no decorators, no compilation
step, and no TypeScript-only friction.

---

## Why UltraORM

| You want | UltraORM gives you |
|---|---|
| A single model definition that works on Postgres, MySQL, or Mongo | `Model` subclass + `static fields = { ... }` |
| Chainable queries like Django's QuerySet | `User.query().where({...}).order('id','DESC').take(10).get()` |
| All four relationship types | `hasMany`, `belongsTo`, `hasOne`, `belongsToMany`, `hasManyThrough`, `morphMany`, `morphOne`, `morphTo`, `morphToMany`, `morphedByMany`, self-referential |
| Safe transactions with deadlock retry | `orm.adapter.transaction(async (client) => { ... }, { maxRetries: 5 })` |
| An escape hatch for raw SQL when the ORM can't express what you need | `orm.adapter.execute(sql, params)` with proper parameterization |
| Built-in field validation | `Field.validate(value)` throws `ValidationError` on bad input |
| Money / decimal handling without float drift | `MoneyField` + `MoneyValue` value object |
| SQL injection safety | Every value is parameterized; every identifier is escaped |
| A real migration story (not just CREATE TABLE) | `orm.migrate()` syncs all registered models in one call |

---

## Installation

```bash
npm install ultraorm
# or
bun add ultraorm
```

Install **one** peer dependency matching your database:

```bash
npm install pg        # PostgreSQL
npm install mysql2    # MySQL
npm install mongodb   # MongoDB
```

UltraORM works on Node.js >= 14.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Tutorial 1 — Blog CRUD](#tutorial-1--blog-crud)
3. [Tutorial 2 — E-commerce with complex queries](#tutorial-2--e-commerce-with-complex-queries)
4. [Field types reference](#field-types-reference)
5. [Model API reference](#model-api-reference)
6. [QuerySet API reference](#queryset-api-reference)
7. [Query operators](#query-operators)
8. [Relationships reference](#relationships-reference)
9. [Transactions](#transactions)
10. [Raw SQL escape hatch](#raw-sql-escape-hatch)
11. [Error handling](#error-handling)
12. [What's new in v2.1.0](#whats-new-in-v210)
13. [Running the test suite](#running-the-test-suite)
14. [License](#license)

---

## Quick start

```js
const {
  UltraORM, Model,
  IntegerField, StringField, EmailField, DateTimeField, BooleanField,
} = require('ultraorm');

// 1. Define a model
class User extends Model {}
User.tableName = 'users';
User.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ maxLength: 100, nullable: false }),
  email: new EmailField({ unique: true, nullable: false }),
  is_active: new BooleanField({ default: true }),
  created_at: new DateTimeField({ autoNowAdd: true }),
};

// 2. Connect and migrate
const orm = new UltraORM({
  type: 'postgres',          // 'postgres' | 'mysql' | 'mongodb'
  host: 'localhost',
  database: 'myapp',
  user: 'postgres',
  password: 'postgres',
});
await orm.connect();
orm.registerModel(User);
await orm.migrate();         // CREATE TABLE IF NOT EXISTS ...

// 3. Create, read, update, delete
const alice = new User({ name: 'Alice', email: 'alice@example.com' });
await alice.save();
console.log(alice.get('id')); // 1

const found = await User.query().where({ email: 'alice@example.com' }).first();
found.set('name', 'Alice Smith');
await found.save();

await found.delete();
```

---

## Tutorial 1 — Blog CRUD

A minimal blog: Authors write Posts, Posts have Comments. Demonstrates
model definition, basic CRUD, eager loading, validation, and pagination.

### Step 1 — Define the models

```js
// models.js
const {
  Model, IntegerField, StringField, TextField, EmailField,
  DateTimeField, BooleanField, ForeignKey,
} = require('ultraorm');

class Author extends Model {}
Author.tableName = 'authors';
Author.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ maxLength: 120, nullable: false }),
  email: new EmailField({ unique: true, nullable: false }),
  bio: new TextField({ nullable: true }),
  created_at: new DateTimeField({ autoNowAdd: true }),
};

class Post extends Model {}
Post.tableName = 'posts';
Post.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  title: new StringField({ maxLength: 200, nullable: false }),
  slug: new StringField({ maxLength: 200, unique: true }),
  body: new TextField({ nullable: false }),
  published: new BooleanField({ default: false }),
  author_id: new ForeignKey(Author, { nullable: false, onDelete: 'CASCADE' }),
  published_at: new DateTimeField({ nullable: true }),
  created_at: new DateTimeField({ autoNowAdd: true }),
  updated_at: new DateTimeField({ autoNow: true }),
};

class Comment extends Model {}
Comment.tableName = 'comments';
Comment.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  post_id: new ForeignKey(Post, { nullable: false, onDelete: 'CASCADE' }),
  author_name: new StringField({ maxLength: 120, nullable: false }),
  author_email: new EmailField({ nullable: false }),
  body: new TextField({ nullable: false }),
  approved: new BooleanField({ default: false }),
  created_at: new DateTimeField({ autoNowAdd: true }),
};

// Relationships
Author.hasMany(Post, { foreignKey: 'author_id', as: 'posts' });
Post.belongsTo(Author, { foreignKey: 'author_id', as: 'author' });
Post.hasMany(Comment, { foreignKey: 'post_id', as: 'comments' });
Comment.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

module.exports = { Author, Post, Comment };
```

### Step 2 — Connect & migrate

```js
const { UltraORM } = require('ultraorm');
const { Author, Post, Comment } = require('./models');

const orm = new UltraORM({
  type: 'postgres',
  host: 'localhost', database: 'blog',
  user: 'postgres', password: 'postgres',
});

async function setup() {
  await orm.connect();
  orm.registerModel(Author);
  orm.registerModel(Post);
  orm.registerModel(Comment);
  await orm.migrate();
}
```

### Step 3 — Create

```js
async function createData() {
  // Create an author
  const alice = await Author.create({
    name: 'Alice Tanaka',
    email: 'alice@example.com',
    bio: 'Backend engineer & occasional blogger',
  });

  // Create a post authored by Alice
  const post = await Post.create({
    title: 'Why I switched to UltraORM',
    slug: 'why-i-switched-to-ultraorm',
    body: 'After years of Sequelize and Prisma...',
    author_id: alice.get('id'),
    published: true,
    published_at: new Date(),
  });

  // Comments on the post
  await Comment.create({
    post_id: post.get('id'),
    author_name: 'Bob',
    author_email: 'bob@example.com',
    body: 'Great post!',
  });
  await Comment.create({
    post_id: post.get('id'),
    author_name: 'Carol',
    author_email: 'carol@example.com',
    body: 'Disagree on point 3, but enjoyed the read.',
  });

  return post;
}
```

### Step 4 — Read with eager loading

```js
async function readPost(slug) {
  // Eager-load the author and all comments in 2 queries (not N+1)
  const post = await Post.query()
    .include(['author', 'comments'])
    .where({ slug })
    .firstOrFail('Post not found');

  console.log(post.get('title'));
  console.log('by', post.author.get('name'));
  console.log(post.comments.length, 'comments:');
  for (const c of post.comments) {
    console.log('  -', c.get('author_name'), ':', c.get('body'));
  }
  return post;
}
```

### Step 5 — Update

```js
async function approveComments(postId) {
  // Bulk update via QuerySet: approve all comments on a post
  const updated = await Comment.query()
    .where({ post_id: postId, approved: false })
    .update({ approved: true });
  console.log(`Approved ${updated} comments`);
}

async function editPost(postId, newTitle) {
  const post = await Post.findById(postId);
  post.set('title', newTitle);
  await post.save();   // only the changed field is written
}
```

### Step 6 — Delete

```js
async function deletePost(postId) {
  const post = await Post.findById(postId);
  await post.delete();
  // Comments are auto-deleted because of ON DELETE CASCADE on the FK
}
```

### Step 7 — Paginated listing

```js
async function listPosts(page = 1, perPage = 10) {
  const result = await Post.query()
    .where({ published: true })
    .order('published_at', 'DESC')
    .paginate(page, perPage);

  console.log(`Page ${result.pagination.page} of ${result.pagination.lastPage}`);
  for (const p of result.items) {
    console.log(`  #${p.get('id')}  ${p.get('title')}`);
  }
  return result;
}
```

### What you just learned

- How to define three models with `IntegerField`, `StringField`, `TextField`,
  `EmailField`, `DateTimeField`, `BooleanField`, and `ForeignKey`.
- How `autoNowAdd` / `autoNow` give you automatic timestamps.
- How to define `hasMany` / `belongsTo` relationships.
- How `include([...])` eager-loads related rows (no N+1).
- How `.paginate()` returns `{ items, pagination }` in one call.
- How `onDelete: 'CASCADE'` propagates deletes to children.
- How `.update({...})` on a QuerySet performs a bulk UPDATE.

---

## Tutorial 2 — E-commerce with complex queries

A small e-commerce backend: Customers place Orders containing OrderItems;
Orders are paid via Polymorphic Payments, rated via Polymorphic Ratings,
and tracked across multiple restaurants through a hasManyThrough chain.
Demonstrates transactions, polymorphic relations, M:N with pivot data,
aggregations, raw SQL, and complex eager loading.

### Models

```js
const {
  Model, UltraORM,
  IntegerField, DecimalField, StringField, TextField, EmailField,
  DateTimeField, BooleanField, EnumField, JSONField,
  ForeignKey, OneToOneField,
} = require('ultraorm');

// Customers & restaurants
class Customer extends Model {}
Customer.tableName = 'customers';
Customer.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ maxLength: 120, nullable: false }),
  email: new EmailField({ unique: true, nullable: false }),
  metadata: new JSONField({ default: {} }),
  created_at: new DateTimeField({ autoNowAdd: true }),
};

class Restaurant extends Model {}
Restaurant.tableName = 'restaurants';
Restaurant.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ maxLength: 160, nullable: false }),
  city: new StringField({ maxLength: 80 }),
  is_open: new BooleanField({ default: true }),
  created_at: new DateTimeField({ autoNowAdd: true }),
};

class MenuItem extends Model {}
MenuItem.tableName = 'menu_items';
MenuItem.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  restaurant_id: new ForeignKey(Restaurant, { nullable: false }),
  name: new StringField({ maxLength: 160, nullable: false }),
  price: new DecimalField({ precision: 12, scale: 2 }),
  is_available: new BooleanField({ default: true }),
};

class Order extends Model {}
Order.tableName = 'orders';
Order.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  customer_id: new ForeignKey(Customer, { nullable: false }),
  restaurant_id: new ForeignKey(Restaurant, { nullable: false }),
  status: new EnumField({
    values: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending',
  }),
  subtotal: new DecimalField({ precision: 12, scale: 2 }),
  tax: new DecimalField({ precision: 12, scale: 2, default: 0 }),
  total: new DecimalField({ precision: 12, scale: 2 }),
  placed_at: new DateTimeField({ autoNowAdd: true }),
  delivered_at: new DateTimeField({ nullable: true }),
};

class OrderItem extends Model {}
OrderItem.tableName = 'order_items';
OrderItem.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  order_id: new ForeignKey(Order, { nullable: false, onDelete: 'CASCADE' }),
  menu_item_id: new ForeignKey(MenuItem, { nullable: false }),
  quantity: new IntegerField({ nullable: false, min: 1 }),
  unit_price: new DecimalField({ precision: 12, scale: 2 }),
};

// Polymorphic: a Payment can pay for an Order OR a Subscription (not shown)
class Payment extends Model {}
Payment.tableName = 'payments';
Payment.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  payable_type: new StringField({ maxLength: 60, nullable: false }), // 'orders' or 'subscriptions'
  payable_id: new IntegerField({ nullable: false }),
  amount: new DecimalField({ precision: 12, scale: 2 }),
  method: new EnumField({ values: ['card', 'wallet', 'cash'], default: 'card' }),
  status: new EnumField({ values: ['pending', 'succeeded', 'failed', 'refunded'], default: 'pending' }),
  created_at: new DateTimeField({ autoNowAdd: true }),
};

// Polymorphic ratings — a Rating can target a Restaurant OR a MenuItem OR a Driver
class Rating extends Model {}
Rating.tableName = 'ratings';
Rating.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  ratingable_type: new StringField({ maxLength: 60, nullable: false }),
  ratingable_id: new IntegerField({ nullable: false }),
  customer_id: new ForeignKey(Customer, { nullable: false }),
  score: new IntegerField({ min: 1, max: 5 }),
  comment: new TextField({ nullable: true }),
  created_at: new DateTimeField({ autoNowAdd: true }),
};

// Relationships
Customer.hasMany(Order, { foreignKey: 'customer_id', as: 'orders' });
Restaurant.hasMany(MenuItem, { foreignKey: 'restaurant_id', as: 'menu_items' });
Restaurant.hasMany(Order, { foreignKey: 'restaurant_id', as: 'orders' });
Order.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
Order.belongsTo(Restaurant, { foreignKey: 'restaurant_id', as: 'restaurant' });
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
OrderItem.belongsTo(MenuItem, { foreignKey: 'menu_item_id', as: 'menu_item' });
// morphMany: Restaurant.ratings
Restaurant.morphMany(Rating, { morphName: 'ratingable', as: 'ratings' });
MenuItem.morphMany(Rating, { morphName: 'ratingable', as: 'ratings' });
```

### Transactional order placement

Place an order atomically — write to `orders`, `order_items`, and `payments`
in a single transaction. If anything fails, everything rolls back.

```js
async function placeOrder({ customer, restaurant, items, paymentMethod = 'card' }) {
  return await orm.adapter.transaction(async (tx) => {
    // 1. Lock menu items to prevent price races
    const ids = items.map((i) => i.menu_item_id);
    const { rows: menuRows } = await tx.query(
      `SELECT id, price, is_available FROM menu_items WHERE id = ANY($1::int[]) FOR UPDATE`,
      [ids]
    );
    const menuById = new Map(menuRows.map((r) => [r.id, r]));
    for (const it of items) {
      const m = menuById.get(it.menu_item_id);
      if (!m) throw new Error(`Menu item ${it.menu_item_id} not found`);
      if (!m.is_available) throw new Error(`Menu item ${it.menu_item_id} is not available`);
    }

    // 2. Compute totals
    let subtotal = 0;
    for (const it of items) {
      subtotal += parseFloat(menuById.get(it.menu_item_id).price) * it.quantity;
    }
    const tax = parseFloat((subtotal * 0.08).toFixed(2));
    const total = parseFloat((subtotal + tax).toFixed(2));

    // 3. Insert order
    const { rows: orderRows } = await tx.query(
      `INSERT INTO orders (customer_id, restaurant_id, status, subtotal, tax, total)
       VALUES ($1, $2, 'confirmed', $3, $4, $5) RETURNING id`,
      [customer.get('id'), restaurant.get('id'), subtotal, tax, total]
    );
    const orderId = orderRows[0].id;

    // 4. Insert items
    for (const it of items) {
      const m = menuById.get(it.menu_item_id);
      await tx.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, it.menu_item_id, it.quantity, m.price]
      );
    }

    // 5. Insert payment
    const { rows: payRows } = await tx.query(
      `INSERT INTO payments (payable_type, payable_id, amount, method, status)
       VALUES ('orders', $1, $2, $3, 'succeeded') RETURNING id`,
      [orderId, total, paymentMethod]
    );

    return { orderId, paymentId: payRows[0].id, subtotal, tax, total };
  }, {
    isolationLevel: 'READ COMMITTED',
    maxRetries: 3,         // auto-retry on deadlock
    lockTimeout: 5,        // seconds
    statementTimeout: 30000, // ms
  });
}
```

### Complex query 1 — Deep eager loading

Fetch the 10 most recent orders with their customer, restaurant, items, and
each item's menu item — all in a fixed number of queries (no N+1).

```js
const recentOrders = await Order.query()
  .include(['customer', 'restaurant', 'items', 'items.menu_item'])
  .where({ status: 'delivered' })
  .order('placed_at', 'DESC')
  .take(10)
  .get();

for (const o of recentOrders) {
  console.log(
    `Order #${o.get('id')} — ${o.customer.get('name')} @ ${o.restaurant.get('name')} — $${o.get('total')}`
  );
  for (const oi of o.items) {
    console.log(`  ${oi.get('quantity')}x ${oi.menu_item.get('name')} @ ${oi.get('unit_price')}`);
  }
}
```

### Complex query 2 — Aggregations via QuerySet

```js
// Average order value for a restaurant
const avg = await Order.query()
  .where({ restaurant_id: 1, status: 'delivered' })
  .aggregate('AVG', 'total');
console.log('Avg order value:', avg);

// Total revenue per restaurant (GROUP BY + SUM)
const revenueByRestaurant = await orm.adapter.execute(`
  SELECT r.name, SUM(o.total) AS revenue, COUNT(o.id) AS orders
    FROM orders o
    JOIN restaurants r ON r.id = o.restaurant_id
   WHERE o.status NOT IN ('cancelled')
   GROUP BY r.name
   ORDER BY revenue DESC
   LIMIT 10
`);
```

### Complex query 3 — Filtered search with operators

```js
// Find high-value orders from this week, paid by card, not yet delivered
const highValueOrders = await Order.query()
  .where({
    status: { $in: ['confirmed', 'preparing', 'out_for_delivery'] },
    total: { $gte: 100 },
    placed_at: { $gte: new Date(Date.now() - 7 * 86400000) },
  })
  .where('tax', '>', 5)
  .order('total', 'DESC')
  .take(20)
  .get();
```

### Complex query 4 — Polymorphic ratings

```js
// Get all ratings for a restaurant (morphMany)
const restaurant = await Restaurant.findById(1);
const ratings = await Rating.query()
  .where({ ratingable_type: 'restaurants', ratingable_id: restaurant.get('id') })
  .order('created_at', 'DESC')
  .take(10)
  .get();

// Average rating via raw SQL (cleaner than building it through QuerySet)
const { rows } = await orm.adapter.execute(`
  SELECT AVG(score)::numeric(3,2) AS avg, COUNT(*)::int AS n
    FROM ratings
   WHERE ratingable_type = 'restaurants' AND ratingable_id = $1
`, [restaurant.get('id')]);
console.log(`Avg rating: ${rows[0].avg} from ${rows[0].n} reviews`);
```

### Complex query 5 — Pagination with filter

```js
// Paginated order history for a customer
const page1 = await Order.query()
  .where({ customer_id: 42 })
  .include(['restaurant', 'items'])
  .order('placed_at', 'DESC')
  .paginate(1, 20);

console.log(`${page1.pagination.total} total orders`);
console.log(`Showing page ${page1.pagination.page} of ${page1.pagination.lastPage}`);
```

### Complex query 6 — bulkCreate + M:N attach helpers

```js
// Bulk-insert 50 menu items for a new restaurant
const items = await MenuItem.bulkCreate(
  Array.from({ length: 50 }, (_, i) => ({
    restaurant_id: 1,
    name: `Dish #${i + 1}`,
    price: parseFloat((5 + i * 0.5).toFixed(2)),
  }))
);
console.log(`Created ${items.length} menu items`);
```

### What you just learned

- `orm.adapter.transaction(callback, options)` with deadlock retry, isolation
  level, lock timeout, and statement timeout.
- `FOR UPDATE` row locking inside transactions to prevent race conditions.
- Deep eager loading via `include(['customer', 'restaurant', 'items', 'items.menu_item'])`.
- Query operators (`$in`, `$gte`) mixed with `where('field', '>', value)` syntax.
- `paginate(page, perPage)` returns items + pagination metadata.
- Polymorphic relations via `morphMany` / `morphTo`.
- `bulkCreate` for batch inserts.
- Raw SQL escape hatch via `orm.adapter.execute(sql, params)`.

---

## Field types reference

Every field accepts these base options:

| Option | Type | Default | Description |
|---|---|---|---|
| `primaryKey` | boolean | `false` | Mark as primary key |
| `unique` | boolean | `false` | Unique constraint |
| `nullable` | boolean | `true` | Allow NULL |
| `default` | any \| `() => any` | — | Default value or factory |
| `autoIncrement` | boolean | `false` | Auto-incrementing integer |
| `validators` | `Array<Function>` | `[]` | Custom validators |
| `dbType` | string | — | Override the SQL type |
| `index` | boolean | `false` | Create an index on this column |
| `description` | string | — | For documentation |

### Numeric fields

```js
new IntegerField({ min: 0, max: 100 })
new BigIntegerField()         // 64-bit integer
new SmallIntegerField()       // 16-bit
new TinyIntegerField()        // 0–255
new DecimalField({ precision: 10, scale: 2 })  // fixed-point
new FloatField()              // double-precision
```

### String fields

```js
new StringField({ maxLength: 255 })
new CharField({ maxLength: 80 })           // alias for StringField
new TextField()                            // TEXT (or MEDIUMTEXT / LONGTEXT)
new EmailField({ unique: true })           // validated as email
new SlugField()                            // URL-safe slug
new URLField()                             // validated as URL
new UUIDField()                            // UUID
new EnumField({ values: ['draft', 'published', 'archived'] })
```

### Date & time

```js
new DateField()
new TimeField()
new DateTimeField({ autoNowAdd: true })    // set once on insert
new DateTimeField({ autoNow: true })       // updated on every save
```

### Other types

```js
new BooleanField({ default: false })
new JSONField({ default: {} })
new BinaryField()                          // BYTEA / BLOB
```

### Money

```js
new MoneyField({ currency: 'USD' })        // stored as BIGINT cents
new MoneyField({ currency: 'USD', minValue: 0, maxValue: 1000000 })
new MoneyField({ currency: 'USD', storeAsCents: false })  // DECIMAL(19,2)
```

The `MoneyValue` value object gives you safe arithmetic:

```js
const { MoneyValue } = require('ultraorm');
const a = new MoneyValue(19.99, 'USD');
const b = new MoneyValue(5.50, 'USD');
a.add(b).amount            // 25.49
a.subtract(b).amount       // 14.49
a.multiply(2).amount       // 39.98
a.toCents()                // 1999
a.format()                 // '$19.99'
a.format({ locale: 'de-DE', showCode: true })  // '19,99 $ US'
MoneyValue.fromCents(1999, 'USD').amount       // 19.99
MoneyValue.zero('USD').amount                  // 0
```

### Relationship fields

```js
new ForeignKey(User, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
new OneToOneField(User, { unique: true })
```

---

## Model API reference

### Defining a model

```js
class User extends Model {}
User.tableName = 'users';
User.fields = { /* ... */ };
User.indexes = [
  { fields: ['email'], options: { unique: true } },
  { fields: ['last_name', 'first_name'], options: {} },
];
```

> **v2.1.0 critical fix**: `static fields`, `static associations`, `static indexes`,
> and `static options` are now per-class. In v2.0.0 they were accidentally shared
> across all subclasses (JavaScript static field initializers run once on the
> parent class), so two models with the same `as` name silently overwrote each
> other. v2.1.0 fixes this with per-class lazy getters.

### Static query methods

| Method | Returns | Description |
|---|---|---|
| `Model.query()` | `QuerySet` | Start a new chainable query |
| `Model.create(data)` | `Promise<Model>` | Build + save in one call |
| `Model.bulkCreate(records)` | `Promise<Array<Model>>` | Insert many rows; uses `RETURNING` on Postgres |
| `Model.find(where, options)` | `Promise<Array<Model>>` | Find matching rows |
| `Model.findOne(where)` | `Promise<Model\|null>` | Find first match |
| `Model.findById(id)` | `Promise<Model\|null>` | Lookup by primary key |
| `Model.findOrFail(id, msg)` | `Promise<Model>` | Lookup or throw `NotFoundError` |
| `Model.firstOrCreate(where, data)` | `Promise<Model>` | Find or create + return |
| `Model.updateOrCreate(where, data)` | `Promise<Model>` | Update or create + return |
| `Model.count(where)` | `Promise<number>` | Count matching rows |
| `Model.exists(where)` | `Promise<boolean>` | Existence check |
| `Model.sync()` | `Promise<void>` | Create table if not exists (called by `orm.migrate()`) |

### Instance methods

| Method | Returns | Description |
|---|---|---|
| `instance.get(field)` | `any` | Read field (applies `fromDatabase`) |
| `instance.set(field, value)` | `Model` | Write field (applies `prepareValue` + validates) |
| `instance.fill(data)` | `Model` | Set multiple fields at once |
| `instance.merge(data)` | `Model` | Like `fill` but skips validation |
| `instance.save()` | `Promise<Model>` | Insert (if new) or update (if existing) |
| `instance.delete()` | `Promise<void>` | Delete this row |
| `instance.refresh()` | `Promise<Model>` | Reload from DB |
| `instance.validate()` | `void` | Run all field validators |
| `instance.toJSON()` | `object` | Plain JSON-safe object |
| `instance.toObject()` | `object` | Alias for `toJSON` |
| `instance.getAttributes()` | `object` | Raw `data` object |
| `instance.getChanged()` | `Array<string>` | List of dirty fields |
| `instance.isDirty()` | `boolean` | Whether anything changed |

### M:N pivot helpers (on instances)

```js
// Attach / detach / sync roles on a user
await user.attach('roles', [1, 2, 3]);
await user.detach('roles', [2]);           // remove role 2
await user.sync('roles', [1, 3]);          // set roles to exactly [1, 3]
await user.toggle('roles', [4]);           // attach if absent, detach if present
await user.updatePivot('roles', 1, { assigned_at: new Date() });
await user.hasAttached('roles', 1);        // boolean
```

---

## QuerySet API reference

`Model.query()` returns a `QuerySet`. Every method below returns the same
`QuerySet` (for chaining) unless noted otherwise.

### Filtering

| Method | Example |
|---|---|
| `.where(conditions)` | `.where({ status: 'active' })` |
| `.where(field, op, value)` | `.where('age', '>=', 18)` |
| `.where(field, value)` | `.where('name', 'Alice')` (equality) |
| `.where(field, [v1, v2])` | `.where('id', [1, 2, 3])` (IN) |
| `.orWhere(conditions)` | `.where({a:1}).orWhere({b:2})` |
| `.whereOp(field, op, value)` | `.whereOp('age', '>=', 18)` |
| `.whereIn(field, values)` | `.whereIn('id', [1, 2, 3])` |
| `.whereNotIn(field, values)` | `.whereNotIn('status', ['cancelled'])` |
| `.whereNull(field)` | `.whereNull('deleted_at')` |
| `.whereNotNull(field)` | `.whereNotNull('email')` |
| `.whereBetween(field, [min, max])` | `.whereBetween('age', [18, 65])` |
| `.whereNotBetween(field, range)` | |
| `.whereLike(field, pattern)` | `.whereLike('name', 'Alic%')` |
| `.whereNotLike(field, pattern)` | |
| `.search(field, value)` | Case-insensitive substring search |

### Shaping

| Method | Example |
|---|---|
| `.select(...fields)` | `.select('id', 'name', 'email')` |
| `.distinct(field?)` | `.distinct('email')` |
| `.include(relations)` | `.include(['author', 'comments'])` — eager load |
| `.with(relations)` | Alias for `include` |

### Ordering & pagination

| Method | Example |
|---|---|
| `.order(field, direction)` | `.order('created_at', 'DESC')` |
| `.orderBy(field, direction)` | Alias for `order` |
| `.orderByMultiple(fields)` | `.orderByMultiple(['last_name ASC', 'first_name ASC'])` |
| `.limit(n)` / `.take(n)` | `.take(10)` |
| `.offset(n)` / `.skip(n)` | `.skip(20)` |
| `.paginate(page, perPage)` | Returns `{ items, pagination }` |

### Grouping

| Method | Example |
|---|---|
| `.groupBy(fields)` | `.groupBy('status')` |
| `.having(condition)` | `.having('COUNT(*) > 5')` |

### Locking

| Method | Example |
|---|---|
| `.forUpdate()` | Append `FOR UPDATE` (row-level lock) |
| `.lockInShareMode()` | Append `LOCK IN SHARE MODE` (MySQL) |

### Execution (terminal — returns data, ends the chain)

| Method | Returns | Description |
|---|---|---|
| `.get()` | `Promise<Array<Model>>` | Execute and return all matches |
| `.first()` | `Promise<Model\|null>` | Take 1 and return first |
| `.firstOrFail(msg)` | `Promise<Model>` | First or throw `NotFoundError` |
| `.count(field?)` | `Promise<number>` | COUNT(*) |
| `.exists()` | `Promise<boolean>` | Existence check |
| `.aggregate(op, field)` | `Promise<number>` | SUM / AVG / MIN / MAX / COUNT |
| `.values(...fields)` | `Promise<Array<object>>` | Plain objects, not Model instances |
| `.value(field)` | `Promise<any>` | Single scalar |
| `.update(data)` | `Promise<number>` | Bulk UPDATE; returns affected count |
| `.increment(field, amount?)` | `Promise<number>` | `field = field + amount` |
| `.decrement(field, amount?)` | `Promise<number>` | `field = field - amount` |
| `.delete()` | `Promise<number>` | Bulk DELETE; returns deleted count |
| `.paginate(page, perPage)` | `Promise<{items, pagination}>` | Convenience pagination |

---

## Query operators

Pass these as keys inside `.where({...})` for richer conditions:

```js
User.query().where({
  age: { $gte: 18, $lte: 65 },
  status: { $in: ['active', 'pending'] },
  email: { $endsWith: '@example.com' },
  deleted_at: { $isNull: true },
  score: { $between: [0, 100] },
})
```

| Operator | SQL equivalent |
|---|---|
| `$eq`, `$ne` | `=`, `!=` |
| `$gt`, `$gte`, `$lt`, `$lte` | `>`, `>=`, `<`, `<=` |
| `$in`, `$notIn` | `IN (...)`, `NOT IN (...)` |
| `$isNull`, `$isNotNull` | `IS NULL`, `IS NOT NULL` |
| `$like`, `$notLike` | `LIKE`, `NOT LIKE` |
| `$startsWith` | `LIKE 'value%'` |
| `$endsWith` | `LIKE '%value'` |
| `$contains` | `LIKE '%value%'` |
| `$between`, `$notBetween` | `BETWEEN ? AND ?` |
| `$exists` | `IS NOT NULL` (true) / `IS NULL` (false) |

---

## Relationships reference

UltraORM supports every common relationship pattern. All are defined as
static methods on the model.

### One-to-many

```js
Author.hasMany(Post, { foreignKey: 'author_id', as: 'posts' });
Post.belongsTo(Author, { foreignKey: 'author_id', as: 'author' });
```

### One-to-one

```js
User.hasOne(Profile, { foreignKey: 'user_id', as: 'profile' });
Profile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
// Or use OneToOneField in the schema:
// user_id: new OneToOneField(User, { unique: true, nullable: false })
```

### Many-to-many (with junction model)

```js
User.belongsToMany(Role, {
  through: UserRole,        // junction Model class
  foreignKey: 'user_id',    // on junction → User
  otherKey: 'role_id',      // on junction → Role
  as: 'roles',
  withPivot: ['assigned_at'], // optional: also load pivot columns
});
Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id', otherKey: 'user_id', as: 'users' });
```

Then on instances:

```js
await user.attach('roles', [1, 2]);
await user.detach('roles', [2]);
await user.sync('roles', [1, 3]);
const has = await user.hasAttached('roles', 1);
```

### Has-many-through

```js
// Country has many Posts through Users
Country.hasManyThrough(Post, {
  through: User,
  foreignKey: 'country_id',  // on User → Country
  throughKey: 'id',          // on User, matched against Post.user_id
  targetKey: 'user_id',      // on Post → User
  as: 'posts_through_users',
});
```

### Self-referential

```js
Category.belongsTo(Category, { foreignKey: 'parent_id', as: 'parent' });
Category.hasMany(Category, { foreignKey: 'parent_id', as: 'children' });

// Or use the dedicated helper:
Category.belongsToSelf({ as: 'parent', childrenAs: 'children', foreignKey: 'parent_id' });
```

### Polymorphic one-to-many

```js
// A Comment can belong to a Post OR a Video
Post.morphMany(Comment, { morphName: 'commentable', as: 'comments' });
Video.morphMany(Comment, { morphName: 'commentable', as: 'comments' });
Comment.morphTo({ as: 'commentable' });
// Comment has columns: commentable_type (e.g. 'posts'), commentable_id (int)
```

### Polymorphic one-to-one

```js
Post.morphOne(Image, { morphName: 'imageable', as: 'image' });
Image.morphTo({ as: 'imageable' });
```

### Polymorphic many-to-many

```js
// Posts and Videos share Tags via a Taggable junction
Post.morphToMany(Tag, {
  through: Taggable, morphName: 'taggable',
  foreignKey: 'tag_id', as: 'tags',
});
Video.morphToMany(Tag, {
  through: Taggable, morphName: 'taggable',
  foreignKey: 'tag_id', as: 'tags',
});

// Inverse: a Tag knows all posts & videos it's attached to
Tag.morphedByMany(Post, {
  through: Taggable, morphName: 'taggable',
  foreignKey: 'tag_id', as: 'posts',
});
Tag.morphedByMany(Video, {
  through: Taggable, morphName: 'taggable',
  foreignKey: 'tag_id', as: 'videos',
});
```

> **v2.1.0 critical fix**: `morphToMany` and `morphedByMany` were defined in
> v2.0.0 but never dispatched by the eager loader — `include('tags')`
> silently did nothing. v2.1.0 ships working loaders for both.

### Eager loading

```js
// Single relation
await User.query().include('posts').get();

// Multiple relations
await User.query().include(['posts', 'profile', 'roles']).get();

// Works with all chaining
const recent = await Post.query()
  .include(['author', 'comments'])
  .where({ published: true })
  .order('published_at', 'DESC')
  .take(10)
  .get();
```

---

## Transactions

UltraORM provides true ACID transactions with deadlock retry, isolation
levels, and Postgres advisory locks.

```js
const result = await orm.adapter.transaction(async (tx) => {
  // `tx` is a transaction client. Its query/execute methods run inside the tx.
  await tx.query(`UPDATE accounts SET balance = balance - $1 WHERE id = $2`, [100, 1]);
  await tx.query(`UPDATE accounts SET balance = balance + $1 WHERE id = $2`, [100, 2]);

  // Advisory locks (Postgres only) for distributed coordination
  await tx.advisoryLock(42);
  // ... critical section ...
  await tx.advisoryUnlock(42);

  return { transferred: 100 };
}, {
  isolationLevel: 'READ COMMITTED',  // READ COMMITTED | REPEATABLE READ | SERIALIZABLE
  maxRetries: 3,                     // auto-retry on deadlock
  retryDelay: 100,                   // ms, exponential backoff
  lockTimeout: 5,                    // seconds
  statementTimeout: 30000,           // ms
});
```

If the callback throws, the transaction is rolled back and the error
re-thrown. Deadlocks (`40P01` on Postgres, `1213` on MySQL) and lock
timeouts (`55P03` / `1205`) trigger an automatic retry with exponential
backoff.

---

## Raw SQL escape hatch

When the ORM can't express what you need, drop down to raw SQL. Every value
is parameterized; UltraORM auto-converts `?` → `$N` for Postgres.

```js
// Simple parameterized query
const { rows, result } = await orm.adapter.execute(
  `SELECT * FROM users WHERE email = ? AND is_active = ?`,
  ['alice@example.com', true]
);

// Complex JOIN + GROUP BY + HAVING
const { rows: topSellers } = await orm.adapter.execute(`
  SELECT u.id, u.name, COUNT(o.id) AS orders, SUM(o.total) AS revenue
    FROM users u
    JOIN orders o ON o.customer_id = u.id
   WHERE o.status NOT IN ('cancelled')
   GROUP BY u.id, u.name
   HAVING SUM(o.total) > 1000
   ORDER BY revenue DESC
   LIMIT 10
`);

// DDL
await orm.adapter.execute(`CREATE INDEX CONCURRENTLY idx_orders_status ON orders (status)`);

// Insert-and-return helper
const { id } = await orm.adapter.insertReturning(
  'users',
  { name: 'Alice', email: 'alice@example.com' },
  'id'
);
```

---

## Error handling

UltraORM ships a typed error hierarchy. Catch the specific class you care
about, or `UltraORMError` to catch them all.

```js
const { ValidationError, NotFoundError, DatabaseError, UltraORMError } = require('ultraorm');

try {
  const user = await User.query().where({ id: 999 }).firstOrFail('User not found');
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log('404:', err.message);            // err.model holds the table name
  } else if (err instanceof ValidationError) {
    console.log('400:', err.message);            // err.field holds the offending Field
  } else if (err instanceof DatabaseError) {
    console.log('500:', err.message);            // err.originalError is the driver error
  } else if (err instanceof UltraORMError) {
    console.log('Generic ORM error:', err.code); // err.code is a string like 'ULTRAORM_ERROR'
  }
}
```

| Error | When thrown | Extra properties |
|---|---|---|
| `UltraORMError` | Base class for everything | `code` |
| `ValidationError` | Field validation fails | `field` |
| `NotFoundError` | `firstOrFail` / `findOrFail` miss | `model` |
| `DatabaseError` | Any DB-side error | `originalError` |

---

## What's new in v2.1.0

v2.1.0 is a **critical bug-fix release**. v2.0.0 had four silent data-loss
bugs that blocked production deployment on PostgreSQL. v2.1.0 fixes all
fifteen bugs found during a systematic audit. See
[CHANGELOG.md](./CHANGELOG.md) for the complete list.

### Critical fixes (silent data loss / blocks usage)

| Bug | Before | After |
|---|---|---|
| **BUG-01** | SERIAL columns skipped `PRIMARY KEY` clause — broke every FK on Postgres | `PRIMARY KEY` always emitted |
| **BUG-02** | `EnumField` emitted MySQL-style inline `ENUM('a','b')` — failed on Postgres | Named pg type created via `CREATE TYPE` |
| **BUG-03** | Constructor re-prepared DB values — corrupted `MoneyField` 100x | `fromDatabase` flag bypasses `set()` |
| **BUG-04** | `belongsToMany` used `r[key]` not `r.get(key)` — silently returned `[]` | Uses `.get()` on Model instances |

### Major fixes (broken features)

| Bug | Fix |
|---|---|
| **BUG-05** | `morphToMany` / `morphedByMany` loaders implemented (were defined but never dispatched) |
| **BUG-06** | Dedicated `_loadHasManyThrough` loader (was reusing belongsToMany with wrong semantics) |
| **BUG-07** | `update()` builds correct `$N` placeholders for Postgres |
| **BUG-08** | `insertReturning` escapes identifiers and routes through `execute()` |
| **BUG-14** | `static associations` is now per-class (was shared across all subclasses) |

### Minor fixes (SQL injection safety, performance)

- **BUG-10**: All emojis stripped from `console.log` output
- **BUG-11**: belongsToMany raw SQL path escapes identifiers
- **BUG-12**: `bulkCreate` calls `prepareValue` via constructor, uses `RETURNING` on Postgres
- **BUG-13**: Identifier escaping in `find` / `delete` / `count` / `exists` / `_executeSQL`
- **BUG-15**: `insert()` fallback path uses correct placeholders per adapter

### Verified by 51 automated tests

```
Unit Tests:           34 passed, 0 failed
Integration Tests:    13 passed, 0 failed
Performance Tests:     4 passed, 0 failed
                     -------------------
Total:                51 passed, 0 failed
```

Benchmark highlights (in-process PGlite, real PostgreSQL):

| Benchmark | Avg latency |
|---|---|
| SELECT by PK | 0.54 ms |
| Complex 4-way JOIN (raw SQL) | 1.05 ms |
| Eager load 3 relations | 2.47 ms |
| Transaction (5 statements) | 3.00 ms |
| bulkCreate 10 users | 5.77 ms |

---

## Running the test suite

The test suite uses [PGlite](https://github.com/electric-sql/pglite) (real
PostgreSQL compiled to WebAssembly) so it runs anywhere without a Postgres
server install.

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

Tests cover: SQL injection safety, transaction rollback, validation,
unique / FK / cascade constraints, pagination, eager loading for every
relationship type, polymorphic relations in both directions, MoneyField
arithmetic, bulkCreate, and complex multi-table JOINs.

---

## License

MIT © Silivestir Assey, Ezekiel Minja. v2.1.0 fixes.
