# UltraORM - The Ultimate Node.js ORM

<p align="center">
  <strong>Write Once, Run Anywhere</strong><br>
  <em>PostgreSQL • MySQL • MongoDB</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ultraorm">
    <img src="https://img.shields.io/npm/v/ultraorm.svg" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/ultraorm">
    <img src="https://img.shields.io/npm/dm/ultraorm.svg" alt="npm downloads">
  </a>
  <a href="https://github.com/yourusername/ultraorm/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/ultraorm.svg" alt="license">
  </a>
</p>

---

## Table of Contents

- [What is UltraORM?](#what-is-ultraorm)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Field Types](#field-types)
- [Query Methods](#query-methods)
- [Model Methods](#model-methods)
- [Relationships](#relationships)
- [Migrations](#migrations)
- [Seeders](#seeders)
- [Transactions](#transactions)
- [Data Transfer](#data-transfer)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Contributing](#contributing)
- [License](#license)

---

## What is UltraORM?

UltraORM is a comprehensive, multi-database Object-Relational Mapping library for Node.js that provides an elegant, intuitive interface for database interactions. It combines the best features from popular ORMs like Django ORM, Sequelize, and Prisma while adding unique capabilities.

### Key Philosophy

- **Write Once, Run Anywhere**: Define your models once and work with PostgreSQL, MySQL, or MongoDB
- **Django-like Ease**: Familiar patterns for developers coming from Django
- **Performance First**: Optimized queries with connection pooling and eager loading
- **Production Ready**: Full error handling, validation, and comprehensive logging

---

## Features

### Database Support
- ✅ PostgreSQL
- ✅ MySQL
- ✅ MongoDB

### Field Types
- ✅ All standard SQL types (INT, VARCHAR, TEXT, BOOLEAN, etc.)
- ✅ UUID with auto-generation
- ✅ Enum fields
- ✅ JSON fields with validation
- ✅ Date/Time fields with auto timestamps
- ✅ Foreign keys with cascade options
- ✅ One-to-One fields

### Query Builder
- ✅ Chainable QuerySet API
- ✅ All comparison operators (=, !=, >, <, >=, <=)
- ✅ LIKE/ILIKE pattern matching
- ✅ IN/NOT IN clauses
- ✅ BETWEEN clauses
- ✅ NULL checks
- ✅ OR conditions
- ✅ GROUP BY & HAVING
- ✅ DISTINCT selection
- ✅ Pagination
- ✅ Aggregation (SUM, AVG, MIN, MAX, COUNT)

### Relationships
- ✅ One-to-One
- ✅ One-to-Many
- ✅ Many-to-Many (with pivot table)
- ✅ Has-Many-Through
- ✅ Self-referential
- ✅ Polymorphic (morphMany, morphOne)
- ✅ Polymorphic Many-to-Many

### Database Operations
- ✅ Auto-sync tables
- ✅ Migration system with versioning
- ✅ Seeder system
- ✅ Transaction support
- ✅ Data transfer between databases
- ✅ Schema cloning

### Performance
- ✅ Connection pooling
- ✅ Eager loading (N+1 prevention)
- ✅ Batch operations
- ✅ Raw query support
- ✅ Query optimization

---

## Quick Start

### 1. Install

```bash
npm install ultraorm
```

### 2. Configure Environment

Create a `.env` file in your project root:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_database
DB_PORT=5432
```

### 3. Create a Model

```javascript
// models/User.js
const { Model, StringField, IntegerField, EmailField, DateTimeField, BooleanField } = require('ultraorm');

class User extends Model {
  static tableName = 'users';
  
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 100, nullable: false }),
    email: new EmailField({ unique: true, nullable: false }),
    isActive: new BooleanField({ default: true }),
    createdAt: new DateTimeField({ autoNowAdd: true }),
    updatedAt: new DateTimeField({ autoNow: true })
  };
}

module.exports = User;
```

### 4. Connect and Query

```javascript
// app.js
const orm = require('ultraorm/bootstrap');

async function main() {
  // Connect to database
  await orm.connect();
  
  // Run migrations
  await orm.migrate();
  
  // Create a user
  const user = await orm.User.create({
    name: 'John Doe',
    email: 'john@example.com'
  });
  
  // Query users
  const activeUsers = await orm.User.query()
    .where({ isActive: true })
    .order('createdAt', 'DESC')
    .take(10)
    .get();
  
  console.log(`Found ${activeUsers.length} active users`);
  
  // Disconnect
  await orm.disconnect();
}

main().catch(console.error);
```

---

## Installation

### npm

```bash
npm install ultraorm
```

### yarn

```bash
yarn add ultraorm
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_TYPE` | Database type (`postgres`, `mysql`, `mongodb`) | `postgres` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` (postgres), `3306` (mysql), `27017` (mongodb) |
| `DB_USER` | Database user | - |
| `DB_PASSWORD` | Database password | - |
| `DB_NAME` | Database name | - |
| `DB_URL` | MongoDB connection URL (alternative) | - |
| `DB_POOL_SIZE` | Connection pool size | 10-20 |
| `DB_IDLE_TIMEOUT` | Idle timeout in ms | 30000 |
| `DB_CONNECTION_TIMEOUT` | Connection timeout in ms | 5000 |

---

## Configuration

### PostgreSQL Configuration

```javascript
const { UltraORM } = require('ultraorm');

const orm = new UltraORM({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  user: 'username',
  password: 'password',
  database: 'mydb',
  poolSize: 20,
  idleTimeoutMillis: 30000
});
```

### MySQL Configuration

```javascript
const orm = new UltraORM({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  user: 'username',
  password: 'password',
  database: 'mydb',
  poolSize: 10
});
```

### MongoDB Configuration

```javascript
const orm = new UltraORM({
  type: 'mongodb',
  url: 'mongodb://localhost:27017',
  database: 'mydb'
});
```

---

## Field Types

### Available Field Types

| Field Type | Description | Database Type |
|------------|-------------|---------------|
| `IntegerField` | Integer values | INT |
| `BigIntegerField` | Large integers | BIGINT |
| `SmallIntegerField` | Small integers | SMALLINT |
| `TinyIntegerField` | Tiny integers (0-255) | TINYINT |
| `DecimalField` | Precise decimals | DECIMAL(precision,scale) |
| `FloatField` | Floating-point | FLOAT |
| `StringField` | Variable strings | VARCHAR(maxLength) |
| `CharField` | Fixed/variable strings | VARCHAR(255) |
| `TextField` | Long text | TEXT |
| `EmailField` | Email with validation | VARCHAR(255) |
| `SlugField` | URL-friendly slugs | VARCHAR(maxLength) |
| `URLField` | URLs with validation | VARCHAR(2048) |
| `UUIDField` | UUID values | CHAR(36) |
| `EnumField` | Enum values | ENUM |
| `DateField` | Date only | DATE |
| `TimeField` | Time only | TIME |
| `DateTimeField` | Date and time | TIMESTAMP |
| `BooleanField` | True/false | BOOLEAN |
| `JSONField` | JSON data | JSON |
| `BinaryField` | Binary data | BLOB |
| `ForeignKey` | Foreign key | INT |
| `OneToOneField` | One-to-one | INT |

### Field Options

All field types accept these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `primaryKey` | boolean | false | Set as primary key |
| `unique` | boolean | false | Unique constraint |
| `nullable` | boolean | true | Allow NULL values |
| `default` | * | null | Default value |
| `autoIncrement` | boolean | false | Auto-increment |
| `dbType` | string | null | Custom DB type |
| `index` | boolean | false | Create index |
| `validators` | array | [] | Custom validators |

### Field Examples

```javascript
// Basic field
new StringField({ nullable: false })

// With validation
new IntegerField({ min: 0, max: 100, default: 0 })

// With pattern
new StringField({ pattern: /^[a-z]+$/, maxLength: 50 })

// Email field (auto-validates email format)
new EmailField({ unique: true })

// DateTime with auto-timestamps
new DateTimeField({ autoNow: true })      // Updates on every save
new DateTimeField({ autoNowAdd: true })  // Only on creation

// Decimal for precise values (e.g., prices)
new DecimalField({ precision: 10, scale: 2 }) // 12345678.90

// Foreign key
new ForeignKey(User, { onDelete: 'CASCADE' })

// Enum
new EnumField({ values: ['active', 'inactive', 'pending'] })
```

---

## Query Methods

### QuerySet API

The `QuerySet` class provides a chainable interface for building complex queries.

#### Basic Filtering

```javascript
// Simple equality
await User.query().where({ status: 'active' }).get()

// Greater than
await User.query().where({ age: { $gt: 18 } }).get()

// Multiple conditions
await User.query()
  .where({ status: 'active', age: { $gte: 18 } })
  .get()

// OR conditions
await User.query()
  .where({ status: 'active' })
  .orWhere({ role: 'admin' })
  .get()
```

#### Comparison Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `$eq` | Equal | `{ age: { $eq: 18 } }` |
| `$ne` | Not equal | `{ status: { $ne: 'deleted' } }` |
| `$gt` | Greater than | `{ age: { $gt: 18 } }` |
| `$gte` | Greater or equal | `{ age: { $gte: 18 } }` |
| `$lt` | Less than | `{ age: { $lt: 65 } }` |
| `$lte` | Less or equal | `{ age: { $lte: 65 } }` |

#### IN and BETWEEN

```javascript
// IN clause
await User.query().whereIn('id', [1, 2, 3]).get()
await User.query().where({ id: { $in: [1, 2, 3] } }).get()

// NOT IN
await User.query().whereNotIn('status', ['deleted', 'archived']).get()

// BETWEEN
await User.query().whereBetween('age', [18, 65]).get()
await User.query().where({ age: { $between: [18, 65] } }).get()
```

#### NULL Checks

```javascript
// IS NULL
await User.query().whereNull('deletedAt').get()

// IS NOT NULL
await User.query().whereNotNull('confirmedAt').get()
```

#### LIKE/Pattern Matching

```javascript
// LIKE (exact match pattern)
await User.query().whereLike('name', '%John%').get()

// NOT LIKE
await User.query().whereNotLike('email', '%@spam.com').get()

// Contains (wraps with %)
await User.query().search('name', 'John').get()

// Starts with
await User.query().where({ name: { $startsWith: 'J' } }).get()

// Ends with
await User.query().where({ email: { $endsWith: '@company.com' } }).get()
```

#### Ordering

```javascript
// Ascending order
await User.query().order('createdAt').get()

// Descending order
await User.query().order('createdAt', 'DESC').get()

// Shorthand for descending
await User.query().order('-createdAt').get()

// Multiple fields
await User.query()
  .order('status')
  .order('name', 'DESC')
  .get()
```

#### Limiting and Offsetting

```javascript
// Limit results
await User.query().take(10).get()
await User.query().limit(10).get()

// Skip (offset)
await User.query().skip(20).get()
await User.query().offset(20).get()

// Paginate
const { items, pagination } = await User.query().paginate(2, 20)
// pagination: { page, perPage, total, totalPages, hasNext, hasPrev }
```

#### Selecting Fields

```javascript
// Select specific fields
await User.query().select('id', 'name', 'email').get()

// Distinct selection
await User.query().distinct('status').get()
```

#### Grouping and Having

```javascript
// GROUP BY
await User.query()
  .groupBy('status')
  .get()

// GROUP BY with HAVING
await User.query()
  .groupBy('status')
  .having('COUNT(*) > 5')
  .get()
```

### Execution Methods

```javascript
// Get all results
const users = await User.query().get()

// Get first result
const user = await User.query().where({ email }).first()

// Get first or throw error
const user = await User.query().where({ id: 1 }).firstOrFail('User not found')

// Check if records exist
const exists = await User.query().where({ email }).exists()

// Count records
const count = await User.query().where({ status: 'active' }).count()

// Get only values (plain objects)
const emails = await User.query().values('email')
// [{ email: 'a@example.com' }, { email: 'b@example.com' }]

// Get single value
const email = await User.query().where({ id: 1 }).value('email')
// 'user@example.com'
```

### Aggregation

```javascript
// Sum
const total = await Order.query().sum('amount')

// Average
const avgAge = await User.query().avg('age')

// Minimum
const minPrice = await Product.query().min('price')

// Maximum
const maxPrice = await Product.query().max('price')

// Count
const count = await User.query().count()
```

### Bulk Operations

```javascript
// Bulk update
await User.query()
  .where({ status: 'inactive' })
  .update({ status: 'archived' })

// Bulk delete
await User.query()
  .where({ status: 'deleted' })
  .delete()

// Increment
await Post.query()
  .where({ id: 1 })
  .increment('viewCount')

// Decrement
await Product.query()
  .where({ id: 1 })
  .decrement('stock')
```

### Eager Loading

```javascript
// Include single relation
await Post.query().include('author').get()

// Include multiple relations
await Post.query().include(['author', 'comments']).get()

// Nested eager loading
await User.query().include({ posts: { include: 'comments' } }).get()
```

---

## Model Methods

### Static Methods

```javascript
// Create a record
const user = await User.create({ name: 'John', email: 'john@example.com' })

// Find by ID
const user = await User.findById(1)

// Find one record
const user = await User.findOne({ email: 'john@example.com' })

// Find or fail
const user = await User.findOrFail(1, 'User not found')

// Find all records
const users = await User.find({ status: 'active' })

// Count records
const count = await User.count({ status: 'active' })

// Check if exists
const exists = await User.exists({ email: 'john@example.com' })

// First or create
const user = await User.firstOrCreate(
  { email: 'john@example.com' },
  { name: 'John', password: 'hashed' }
)

// Update or create
const user = await User.updateOrCreate(
  { email: 'john@example.com' },
  { lastLogin: new Date() }
)

// Bulk create
const users = await User.bulkCreate([
  { name: 'John', email: 'john@example.com' },
  { name: 'Jane', email: 'jane@example.com' }
])

// Create query
const qs = User.query()
```

### Instance Methods

```javascript
// Save (insert or update)
const user = new User({ name: 'John', email: 'john@example.com' })
await user.save()

// Update and save
user.name = 'Johnny'
await user.save()

// Delete
await user.delete()
await user.destroy() // Alias

// Refresh from database
await user.refresh()

// Convert to JSON
const json = user.toJSON()
const obj = user.toObject()

// Fill multiple fields
user.fill({ name: 'Jane', status: 'active' })

// Check if changed
if (user.isDirty()) {
  console.log('Changes:', user.getChanged())
}

// Get specific field
const name = user.get('name')
const name = user.name // Alternative

// Set specific field
user.set('name', 'Jane')
user.name = 'Jane' // Alternative
```

---

## Relationships

### One-to-One

```javascript
class User extends Model {
  static tableName = 'users'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    name: new StringField()
  }
}

class Profile extends Model {
  static tableName = 'profiles'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    userId: new ForeignKey(User),
    bio: new TextField()
  }
}

// Define relationship
User.hasOne(Profile, { foreignKey: 'userId', as: 'profile' })
Profile.belongsTo(User, { foreignKey: 'userId', as: 'user' })

// Usage
const user = await User.query().include('profile').first()
console.log(user.profile.bio)
```

### One-to-Many

```javascript
class User extends Model {
  static tableName = 'users'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    name: new StringField()
  }
}

class Post extends Model {
  static tableName = 'posts'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    userId: new ForeignKey(User),
    title: new StringField(),
    content: new TextField()
  }
}

// Define relationship
User.hasMany(Post, { foreignKey: 'userId', as: 'posts' })
Post.belongsTo(User, { foreignKey: 'userId', as: 'author' })

// Usage
const user = await User.query().include('posts').first()
console.log(user.posts.length, 'posts')

const post = await Post.query().include('author').first()
console.log(post.author.name)
```

### Many-to-Many

```javascript
class User extends Model {
  static tableName = 'users'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    name: new StringField()
  }
}

class Role extends Model {
  static tableName = 'roles'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    name: new StringField()
  }
}

// Junction table
class UserRole extends Model {
  static tableName = 'user_roles'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    userId: new ForeignKey(User),
    roleId: new ForeignKey(Role),
    assignedAt: new DateTimeField({ autoNowAdd: true })
  }
}

// Define relationship
User.belongsToMany(Role, { through: UserRole, as: 'roles' })
Role.belongsToMany(User, { through: UserRole, as: 'users' })

// Usage
const user = await User.query().include('roles').first()
console.log(user.roles.map(r => r.name))

const role = await Role.query().include('users').first()
console.log(role.users.map(u => u.name))
```

### Has-Many-Through

```javascript
// Users have many Posts through Countries
Country.hasManyThrough(Post, {
  through: User,
  foreignKey: 'countryId',
  throughKey: 'id',
  targetKey: 'userId',
  as: 'posts'
})

// Usage
const country = await Country.query().include('posts').first()
console.log(country.posts)
```

### Self-Referential

```javascript
class Category extends Model {
  static tableName = 'categories'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    name: new StringField(),
    parentId: new IntegerField({ nullable: true })
  }
}

// Define relationship
Category.belongsToSelf({ as: 'parent', childrenAs: 'children' })

// Usage
const electronics = await Category.query()
  .where({ name: 'Electronics' })
  .include('children')
  .first()
console.log(electronics.children)
```

### Polymorphic

```javascript
class Post extends Model {
  static tableName = 'posts'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    title: new StringField()
  }
}

class Video extends Model {
  static tableName = 'videos'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    title: new StringField()
  }
}

class Comment extends Model {
  static tableName = 'comments'
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    content: new TextField(),
    commentableType: new StringField(),
    commentableId: new IntegerField()
  }
}

// Define polymorphic
Post.morphMany(Comment, { morphName: 'commentable', as: 'comments' })
Video.morphMany(Comment, { morphName: 'commentable', as: 'comments' })
Comment.morphTo({ as: 'commentable' })

// Usage
const post = await Post.query().include('comments').first()
console.log(post.comments)
```

---

## Migrations

UltraORM provides a complete migration system similar to Django.

### Create Migration

```bash
npm run migrate:make create-users-table
```

This creates a migration file in the `migrations/` folder:

```javascript
module.exports = {
  async up(orm) {
    await orm.adapter.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
      )
    `);
  },
  
  async down(orm) {
    await orm.adapter.execute('DROP TABLE IF EXISTS users');
  }
};
```

### Run Migrations

```bash
npm run migrate:run
```

### Rollback Migration

```bash
npm run migrate:rollback
```

### Reset Migrations

```bash
npm run migrate:reset
```

### Refresh Migrations

```bash
npm run migrate:refresh
```

### Auto-Sync (Quick Alternative)

For development, you can auto-sync models:

```javascript
await orm.migrate()  // Creates all tables
```

---

## Seeders

### Create Seeder

```bash
npm run seed:make users
```

This creates a seeder file:

```javascript
module.exports = {
  async run(orm) {
    await orm.User.create({ name: 'Admin', email: 'admin@example.com', role: 'admin' });
    await orm.User.create({ name: 'User', email: 'user@example.com', role: 'user' });
  },
  
  async clean(orm) {
    await orm.adapter.execute('DELETE FROM users WHERE email LIKE "%@example.com"');
  }
};
```

### Run Seeders

```bash
npm run seed
```

### Refresh Seeders

```bash
npm run seed:refresh
```

---

## Transactions

### Basic Transaction

```javascript
const result = await orm.transaction(async (client) => {
  const user = await orm.User.create({ name: 'John', email: 'john@example.com' });
  await orm.Profile.create({ userId: user.id, bio: 'Hello' });
  return user;
});
```

### Transaction with Error Handling

```javascript
try {
  await orm.transaction(async (client) => {
    const user = await orm.User.create({ name: 'John', email: 'john@example.com' });
    const order = await orm.Order.create({ userId: user.id, total: 100 });
    
    if (total > 1000) {
      throw new Error('Order total too high');
    }
    
    return { user, order };
  });
} catch (error) {
  console.error('Transaction failed:', error.message);
  // All changes are automatically rolled back
}
```

---

## Data Transfer

UltraORM can transfer data between databases while respecting your model schemas.

### Transfer Data

```javascript
// Transfer data from PostgreSQL to MySQL
const stats = await orm.transferTo({
  type: 'mysql',
  host: 'remote-host',
  user: 'root',
  password: 'password',
  database: 'remotedb'
}, {
  tables: ['users', 'posts'],  // Optional: specify tables
  batchSize: 1000,
  clearTarget: false
});

console.log(stats);
// { tables: { users: { rows: 100, status: 'success' }, ... }, totalRows: 500, errors: [] }
```

### Clone Structure

```javascript
// Clone database structure (without data)
const stats = await orm.cloneStructure({
  type: 'mysql',
  host: 'remote-host',
  user: 'root',
  password: 'password',
  database: 'remotedb'
});
```

---

## API Reference

### UltraORM

```javascript
const orm = new UltraORM(config)

// Connection
await orm.connect()
await orm.disconnect()

// Model management
orm.registerModel(User)
orm.model('User')

// Migrations
await orm.migrate()
await orm.makeMigration('name')
await orm.migrateRun()
await orm.migrateRollback()
await orm.migrateReset()
await orm.migrateRefresh()

// Seeders
await orm.makeSeeder('name')
await orm.seed()
await orm.seedRefresh()

// Transactions
await orm.transaction(async (client) => { ... })

// Utilities
await orm.tableExists('users')
await orm.getTables()
await orm.truncate('users')
await orm.dropTable('users')
await orm.raw('NOW()')  // For raw expressions

// Data transfer
await orm.transferTo(targetConfig, options)
await orm.cloneStructure(targetConfig, options)
```

### QuerySet Methods

| Method | Description |
|--------|-------------|
| `where(conditions)` | Add WHERE conditions |
| `orWhere(conditions)` | Add OR WHERE conditions |
| `whereIn(field, values)` | WHERE field IN (...) |
| `whereNotIn(field, values)` | WHERE field NOT IN (...) |
| `whereNull(field)` | WHERE field IS NULL |
| `whereNotNull(field)` | WHERE field IS NOT NULL |
| `whereBetween(field, range)` | WHERE field BETWEEN x AND y |
| `whereLike(field, pattern)` | WHERE field LIKE pattern |
| `whereNotLike(field, pattern)` | WHERE field NOT LIKE pattern |
| `search(field, value)` | WHERE field LIKE %value% |
| `order(field, direction)` | ORDER BY field |
| `limit(limit)` | LIMIT n |
| `offset(offset)` | OFFSET n |
| `take(limit)` | LIMIT n |
| `skip(offset)` | OFFSET n |
| `include(relations)` | Eager load relations |
| `select(fields)` | SELECT specific fields |
| `distinct()` | SELECT DISTINCT |
| `groupBy(fields)` | GROUP BY |
| `having(condition)` | HAVING |
| `forUpdate()` | FOR UPDATE lock |
| `lockInShareMode()` | LOCK IN SHARE MODE |
| `get()` | Execute and get results |
| `first()` | Get first result |
| `firstOrFail(message)` | Get first or throw |
| `count()` | Count records |
| `exists()` | Check if records exist |
| `aggregate(op, field)` | Aggregate calculation |
| `sum(field)` | SUM aggregation |
| `avg(field)` | AVG aggregation |
| `min(field)` | MIN aggregation |
| `max(field)` | MAX aggregation |
| `paginate(page, perPage)` | Paginate results |
| `values(...fields)` | Get plain objects |
| `value(field)` | Get single value |
| `update(data)` | Bulk update |
| `delete()` | Bulk delete |
| `increment(field, amount)` | Increment field |
| `decrement(field, amount)` | Decrement field |

### Model Methods

```javascript
// Static
User.create(data)
User.findById(id)
User.findOne(where, options)
User.findOrFail(id, message)
User.firstOrCreate(where, data)
User.updateOrCreate(where, data)
User.find(where, options)
User.bulkCreate(records)
User.count(where)
User.exists(where)
User.query()
User.sync()
User.orm  // Reference to UltraORM instance

// Instance
user.save()
user.delete()
user.destroy()
user.refresh()
user.toJSON()
user.toObject()
user.fill(data)
user.get(fieldName)
user.set(fieldName, value)
user.isDirty()
user.getChanged()

// Relationships
User.hasMany(Target, options)
User.hasOne(Target, options)
User.belongsTo(Target, options)
User.belongsToMany(Target, options)
User.hasManyThrough(Target, options)
User.morphMany(Target, options)
User.morphOne(Target, options)
User.morphTo(options)
User.morphToMany(Target, options)
User.morphedByMany(Target, options)
User.belongsToSelf(options)
```

---

## Best Practices

### 1. Use Async/Await

```javascript
// ✅ Correct
async function getUsers() {
  const users = await User.find({ status: 'active' });
  return users;
}

// ❌ Avoid
function getUsers() {
  return User.find({ status: 'active' }); // Returns Promise
}
```

### 2. Handle Errors

```javascript
try {
  const user = await User.findOrFail(id);
} catch (error) {
  if (error.name === 'NotFoundError') {
    // Handle 404
  }
  throw error;
}
```

### 3. Use Transactions for Related Operations

```javascript
await orm.transaction(async () => {
  const user = await User.create({ name: 'John' });
  const profile = await Profile.create({ userId: user.id });
  return { user, profile };
});
```

### 4. Index Frequently Queried Fields

```javascript
// For frequently filtered fields
new StringField({ index: true })

// Or define in model
static indexes = [
  { fields: ['status', 'createdAt'] }
];
```

### 5. Validate Before Saving

```javascript
try {
  user.validate();
  await user.save();
} catch (error) {
  if (error.name === 'ValidationError') {
    console.error('Validation failed:', error.message);
  }
}
```

### 6. Use Pagination for Large Datasets

```javascript
// ✅ Efficient
const { items, pagination } = await User.query().paginate(1, 50);

// ❌ May cause memory issues
const users = await User.query().get(); // All users
```

### 7. Close Connections Gracefully

```javascript
process.on('SIGINT', async () => {
  await orm.disconnect();
  process.exit(0);
});
```

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ for Node.js developers</strong>
</p>
