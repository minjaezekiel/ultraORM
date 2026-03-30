# UltraORM - The Ultimate Node.js ORM

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)

**UltraORM** is a powerful, type-safe, and database-agnostic Object-Relational Mapping (ORM) library for Node.js. It provides a unified API for working with PostgreSQL, MySQL, and MongoDB databases while maintaining Django-like ease of use.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Field Types](#field-types)
- [Model Definition](#model-definition)
- [QuerySet Operations](#queryset-operations)
- [Relationships](#relationships)
- [Transactions](#transactions)
- [Migrations](#migrations)
- [Blog Project Example](#blog-project-example)
- [API Reference](#api-reference)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Multi-Database Support**: PostgreSQL, MySQL, and MongoDB
- **Type-Safe**: Full TypeScript support with field types
- **Django-Like API**: Familiar patterns for Django/Python developers
- **Relationship Support**: hasMany, belongsTo, belongsToMany, polymorphic relations
- **Transaction Support**: ACID transactions with deadlock retry
- **Migration System**: Built-in migration management
- **Query Builder**: Chainable, powerful query builder
- **Validation**: Built-in field validation
- **SQL Injection Protection**: Automatic identifier escaping
- **Singleton ORM**: Easy global access pattern

---

## Installation

### Prerequisites

- Node.js >= 14.0.0
- npm or yarn
- A database server (PostgreSQL, MySQL, or MongoDB)

### Install UltraORM

```bash
# Using npm
npm install ultraorm

# Using yarn
yarn add ultraorm

# Using pnpm
pnpm add ultraorm
```

### Install Database Drivers

```bash
# PostgreSQL
npm install pg

# MySQL
npm install mysql2

# MongoDB
npm install mongodb
```

---

## Quick Start

### Basic Setup

```javascript
const { UltraORM, Model, StringField, IntegerField, DateTimeField } = require('ultraorm');

// Create ORM instance
const orm = new UltraORM({
  type: 'postgres',
  host: 'localhost',
  database: 'myapp',
  user: 'admin',
  password: 'secret'
});

// Define a model
class User extends Model {
  static tableName = 'users';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 100, nullable: false }),
    email: new StringField({ unique: true, nullable: false }),
    createdAt: new DateTimeField({ autoNowAdd: true })
  };
}

// Register model
orm.registerModel(User);

// Connect and sync
async function main() {
  await orm.connect();
  await orm.migrate();
  
  // Create a user
  const user = await User.create({ name: 'John Doe', email: 'john@example.com' });
  console.log(user.data);
  
  await orm.disconnect();
}

main();
```

---

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=admin
DB_PASSWORD=secret
DB_NAME=myapp
DB_POOL_SIZE=10
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | `'postgres'` | Database type: `'postgres'`, `'mysql'`, `'mongodb'` |
| `host` | string | `'localhost'` | Database host |
| `port` | number | `5432/3306/27017` | Database port |
| `database` | string | required | Database name |
| `user` | string | required | Database user |
| `password` | string | required | Database password |
| `url` | string | - | MongoDB connection URL |
| `poolSize` | number | `20` | Connection pool size |
| `idleTimeoutMillis` | number | `30000` | Idle timeout in ms |
| `connectionTimeoutMillis` | number | `5000` | Connection timeout in ms |

### Using Bootstrap

```javascript
// Load from bootstrap (reads .env automatically)
const orm = require('ultraorm/bootstrap');

// Or import specific components
const { Model, StringField, IntegerField } = require('ultraorm/bootstrap');
```

---

## Field Types

### Numeric Fields

#### IntegerField
```javascript
new IntegerField({
  min: 0,
  max: 100,
  unsigned: false
})
```

#### BigIntegerField
```javascript
new BigIntegerField({ unsigned: true })
```

#### SmallIntegerField
```javascript
new SmallIntegerField({ min: -32768, max: 32767 })
```

#### TinyIntegerField
```javascript
new TinyIntegerField({ min: 0, max: 255 })
```

#### DecimalField
```javascript
new DecimalField({
  precision: 10,   // Total digits
  scale: 2         // Decimal places
})
```

#### FloatField
```javascript
new FloatField({ min: 0, max: 100 })
```

#### MoneyField
```javascript
new MoneyField({
  currency: 'USD',
  minValue: 0,
  maxValue: 1000000,
  storeAsCents: true  // Store as integer cents
})
```

### String Fields

#### StringField
```javascript
new StringField({
  maxLength: 255,
  minLength: 1,
  pattern: /^[a-z]+$/,
  trim: true
})
```

#### CharField
```javascript
new CharField({ maxLength: 100 })  // Default maxLength: 255
```

#### TextField
```javascript
new TextField()              // TEXT
new TextField({ medium: true })  // MEDIUMTEXT
new TextField({ long: true })   // LONGTEXT
```

#### EmailField
```javascript
new EmailField({ unique: true })
```

#### SlugField
```javascript
new SlugField({ maxLength: 100 })
```

#### URLField
```javascript
new URLField({ maxLength: 2048 })
```

#### UUIDField
```javascript
new UUIDField({ default: () => crypto.randomUUID() })
```

### Date/Time Fields

#### DateField
```javascript
new DateField()
```

#### TimeField
```javascript
new TimeField()
```

#### DateTimeField
```javascript
new DateTimeField({
  autoNow: true,      // Update on every save
  autoNowAdd: true,   // Only on creation
  timezone: 'UTC',
  useTz: false
})
```

### Other Fields

#### BooleanField
```javascript
new BooleanField({ default: false })
```

#### JSONField
```javascript
new JSONField({ default: {} })
```

#### BinaryField
```javascript
new BinaryField({ maxLength: 1024 })
```

#### EnumField
```javascript
new EnumField({
  values: ['active', 'inactive', 'pending'],
  name: 'status_type'
})
```

#### ForeignKey
```javascript
new ForeignKey(User, {
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
  nullable: false
})
```

#### OneToOneField
```javascript
new OneToOneField(User, { onDelete: 'CASCADE' })
```

### Field Options

All fields support these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `primaryKey` | boolean | `false` | Set as primary key |
| `unique` | boolean | `false` | Unique constraint |
| `nullable` | boolean | `true` | Allow NULL values |
| `default` | * | - | Default value or function |
| `autoIncrement` | boolean | `false` | Auto-increment |
| `dbType` | string | - | Custom database type |
| `index` | boolean | `false` | Create index |
| `description` | string | - | Field description |

---

## Model Definition

### Basic Model

```javascript
const { Model, StringField, IntegerField, DateTimeField } = require('ultraorm');

class User extends Model {
  static tableName = 'users';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 100, nullable: false }),
    email: new StringField({ unique: true, nullable: false }),
    createdAt: new DateTimeField({ autoNowAdd: true })
  };
}
```

### CRUD Operations

```javascript
// Create
const user = await User.create({ name: 'John', email: 'john@example.com' });

// Read
const user = await User.findOne({ email: 'john@example.com' });
const user = await User.findById(1);
const users = await User.find({ isActive: true });

// Update
user.name = 'Jane';
await user.save();

// Or update directly
await User.query().where({ id: 1 }).update({ name: 'Jane' });

// Delete
await user.delete();
// Or
await User.query().where({ id: 1 }).delete();
```

---

## QuerySet Operations

The QuerySet provides a chainable, powerful query builder.

### Where Conditions

```javascript
// Simple equality
await User.query().where({ status: 'active' }).get();

// Comparison operators
await User.query()
  .where({ age: { $gt: 18 } })
  .where({ age: { $lte: 65 } })
  .get();

// Multiple conditions
await User.query().where({ status: 'active', country: 'USA' }).get();

// OR conditions
await User.query()
  .where({ status: 'active' })
  .orWhere({ status: 'pending' })
  .get();
```

### Available Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `$eq` | Equal | `{ field: { $eq: value } }` |
| `$ne` | Not equal | `{ field: { $ne: value } }` |
| `$gt` | Greater than | `{ field: { $gt: 10 } }` |
| `$gte` | Greater than or equal | `{ field: { $gte: 10 } }` |
| `$lt` | Less than | `{ field: { $lt: 10 } }` |
| `$lte` | Less than or equal | `{ field: { $lte: 10 } }` |
| `$in` | In array | `{ field: { $in: [1, 2, 3] } }` |
| `$notIn` | Not in array | `{ field: { $notIn: [1, 2] } }` |
| `$isNull` | Is NULL | `{ field: { $isNull: true } }` |
| `$isNotNull` | Is not NULL | `{ field: { $isNotNull: true } }` |
| `$like` | LIKE pattern | `{ field: { $like: '%test%' } }` |
| `$contains` | Contains (LIKE %value%) | `{ field: { $contains: 'test' } }` |
| `$startsWith` | Starts with | `{ field: { $startsWith: 'test' } }` |
| `$endsWith` | Ends with | `{ field: { $endsWith: 'test' } }` |
| `$between` | Between range | `{ field: { $between: [1, 10] } }` |

### Query Methods

```javascript
// Order by
await User.query().order('createdAt', 'DESC').get();
await User.query().orderBy('name', 'ASC').get();
await User.query().orderByMultiple(['name ASC', 'age DESC']).get();

// Limit and offset
await User.query().take(10).get();
await User.query().limit(10).get();
await User.query().skip(20).take(10).get();
await User.query().offset(20).limit(10).get();

// Select specific fields
await User.query().select('id', 'name', 'email').get();

// Distinct
await User.query().distinct().get();
await User.query().distinct('status').get();

// Pagination
const { items, pagination } = await User.query().paginate(2, 20);
// pagination: { page, perPage, total, totalPages, hasNext, hasPrev }
```

### Aggregation

```javascript
// Count
const count = await User.query().count();

// Aggregate methods
const total = await User.query().sum('balance');
const avgAge = await User.query().avg('age');
const oldest = await User.query().min('age');
const youngest = await User.query().max('age');

// Check existence
const exists = await User.query().where({ email }).exists();

// First record
const user = await User.query().first();
const user = await User.query().firstOrFail('User not found');
```

### Bulk Operations

```javascript
// Update multiple records
await User.query()
  .where({ status: 'inactive' })
  .update({ status: 'archived' });

// Delete multiple records
await User.query()
  .where({ deletedAt: { $isNotNull: true } })
  .delete();

// Increment/Decrement
await Post.query().where({ id: 1 }).increment('viewCount');
await Post.query().where({ id: 1 }).increment('count', 5);
await Post.query().where({ id: 1 }).decrement('stock');
```

---

## Relationships

### BelongsTo

```javascript
// Post belongs to User
class Post extends Model {
  static tableName = 'posts';
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    title: new StringField(),
    userId: new ForeignKey(User)
  };
}

Post.belongsTo(User, { foreignKey: 'userId', as: 'author' });

// Usage
const posts = await Post.query().include('author').get();
console.log(posts[0].author.name);
```

### HasMany

```javascript
// User has many Posts
User.hasMany(Post, { foreignKey: 'userId', as: 'posts' });

// Usage
const user = await User.findById(1);
const posts = await Post.query()
  .where({ userId: user.id })
  .get();
```

### HasOne

```javascript
// User has one Profile
User.hasOne(Profile, { foreignKey: 'userId', as: 'profile' });

// Usage
const user = await User.findById(1);
const profile = await Profile.findOne({ userId: user.id });
```

### BelongsToMany (Many-to-Many)

```javascript
// User belongs to many Roles through UserRole
User.belongsToMany(Role, { through: UserRole, as: 'roles' });

// Junction table model
class UserRole extends Model {
  static tableName = 'user_roles';
  static fields = {
    userId: new ForeignKey(User),
    roleId: new ForeignKey(Role)
  };
}

// Usage
const user = await User.findById(1);
await user.attach('roles', [1, 2, 3]);  // Attach roles
await user.detach('roles', [2]);         // Detach role
await user.sync('roles', [1, 3]);       // Replace all roles
await user.toggle('roles', [4]);         // Toggle role
const hasRole = await user.hasAttached('roles', 1);  // Check attachment
```

### Polymorphic Relations

```javascript
// Image belongs to any model (Post, User, etc.)
class Image extends Model {
  static tableName = 'images';
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    url: new StringField(),
    imageableType: new StringField(),
    imageableId: new IntegerField()
  };
}

Image.morphTo({ as: 'imageable' });

// Post has many Images
Post.morphMany(Image, { morphName: 'imageable', as: 'images' });

// Usage
const post = await Post.findById(1);
const images = post.images;
```

### Self-Referential

```javascript
// Category has parent and children
Category.belongsToSelf({ as: 'parent', childrenAs: 'children' });
```

---

## Transactions

```javascript
// Basic transaction
const result = await orm.transaction(async (client) => {
  const user = await User.create({ name: 'John', email: 'john@example.com' });
  await Profile.create({ userId: user.id, bio: 'Hello!' });
  return user;
});

// Transaction with options
const result = await orm.transaction(async (client) => {
  // Your operations
  return result;
}, {
  maxRetries: 5,           // Deadlock retry attempts
  retryDelay: 100,         // Delay between retries (ms)
  isolationLevel: 'SERIALIZABLE',
  lockTimeout: 10,         // Lock timeout (seconds)
  statementTimeout: 30000   // Statement timeout (ms)
});

// PostgreSQL advisory locks
await client.advisoryLock(12345);
try {
  // Your critical section
} finally {
  await client.advisoryUnlock(12345);
}
```

---

## Migrations

### Run Migrations

```javascript
// Sync all models (simple)
await orm.migrate();

// Create migration file
await orm.makeMigration('add-users-table');

// Run pending migrations
await orm.migrateRun();

// Rollback last migration
await orm.migrateRollback();

// Reset all migrations
await orm.migrateReset();

// Refresh migrations
await orm.migrateRefresh();
```

### Manual Migration

```javascript
// migrations/20240101_add_status.js
module.exports = {
  async up(orm) {
    await orm.adapter.execute(`
      ALTER TABLE users ADD COLUMN status VARCHAR(50) DEFAULT 'active'
    `);
  },
  async down(orm) {
    await orm.adapter.execute(`
      ALTER TABLE users DROP COLUMN status
    `);
  }
};
```

---

## Blog Project Example

A complete blog project with Users, Posts, Categories, Tags, and Comments.

### Project Structure

```
blog-project/
├── models/
│   ├── User.js
│   ├── Post.js
│   ├── Category.js
│   ├── Tag.js
│   ├── Comment.js
│   └── PostTag.js
├── server.js
└── .env
```

### Models

```javascript
// models/User.js
const { Model, StringField, IntegerField, DateTimeField, BooleanField, ForeignKey, OneToOneField } = require('ultraorm');

class User extends Model {
  static tableName = 'users';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 100, nullable: false }),
    email: new StringField({ unique: true, nullable: false }),
    password: new StringField({ nullable: false }),
    isActive: new BooleanField({ default: true }),
    createdAt: new DateTimeField({ autoNowAdd: true }),
    updatedAt: new DateTimeField({ autoNow: true })
  };
}

User.hasMany(Post, { foreignKey: 'authorId', as: 'posts' });
User.hasMany(Comment, { foreignKey: 'authorId', as: 'comments' });

module.exports = User;
```

```javascript
// models/Post.js
const { Model, StringField, IntegerField, TextField, DateTimeField, ForeignKey } = require('ultraorm');

class Post extends Model {
  static tableName = 'posts';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    title: new StringField({ maxLength: 200, nullable: false }),
    slug: new StringField({ unique: true, maxLength: 220 }),
    content: new TextField({ nullable: false }),
    excerpt: new TextField(),
    authorId: new ForeignKey(User, { nullable: false }),
    categoryId: new ForeignKey(Category, { nullable: true }),
    publishedAt: new DateTimeField({ nullable: true }),
    createdAt: new DateTimeField({ autoNowAdd: true }),
    updatedAt: new DateTimeField({ autoNow: true })
  };
}

Post.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
Post.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Post.hasMany(Comment, { foreignKey: 'postId', as: 'comments' });
Post.belongsToMany(Tag, { through: PostTag, as: 'tags' });
Post.morphMany(Comment, { morphName: 'commentable', as: 'comments' });

module.exports = Post;
```

```javascript
// models/Category.js
const { Model, StringField, IntegerField, ForeignKey } = require('ultraorm');

class Category extends Model {
  static tableName = 'categories';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 100, unique: true, nullable: false }),
    slug: new StringField({ unique: true, maxLength: 110 }),
    parentId: new ForeignKey(Category, { nullable: true })
  };
}

Category.belongsToSelf({ as: 'parent', childrenAs: 'children' });
Category.hasMany(Post, { foreignKey: 'categoryId', as: 'posts' });

module.exports = Category;
```

```javascript
// models/Tag.js
const { Model, StringField } = require('ultraorm');

class Tag extends Model {
  static tableName = 'tags';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 50, unique: true, nullable: false }),
    slug: new StringField({ unique: true, maxLength: 60 })
  };
}

Tag.belongsToMany(Post, { through: PostTag, as: 'posts' });

module.exports = Tag;
```

```javascript
// models/Comment.js
const { Model, StringField, IntegerField, TextField, DateTimeField, ForeignKey } = require('ultraorm');

class Comment extends Model {
  static tableName = 'comments';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    content: new TextField({ nullable: false }),
    authorId: new ForeignKey(User, { nullable: false }),
    postId: new ForeignKey(Post, { nullable: true }),
    commentableType: new StringField(),
    commentableId: new IntegerField(),
    parentId: new ForeignKey(Comment, { nullable: true }),
    createdAt: new DateTimeField({ autoNowAdd: true })
  };
}

Comment.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
Comment.belongsToSelf({ as: 'parent', childrenAs: 'replies' });
Comment.morphTo({ as: 'commentable' });

module.exports = Comment;
```

### Server Setup

```javascript
// server.js
require('dotenv').config();
const orm = require('ultraorm/bootstrap');
const User = require('./models/User');
const Post = require('./models/Post');
const Category = require('./models/Category');
const Tag = require('./models/Tag');
const Comment = require('./models/Comment');

async function main() {
  await orm.connect();
  await orm.migrate();
  
  // Create sample data
  const author = await User.create({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'hashed_password'
  });
  
  const category = await Category.create({ name: 'Technology', slug: 'technology' });
  
  const post = await Post.create({
    title: 'Getting Started with UltraORM',
    slug: 'getting-started-ultraorm',
    content: 'UltraORM is amazing...',
    authorId: author.id,
    categoryId: category.id
  });
  
  // Create and attach tags
  const tag1 = await Tag.create({ name: 'Node.js', slug: 'nodejs' });
  const tag2 = await Tag.create({ name: 'ORM', slug: 'orm' });
  await post.attach('tags', [tag1.id, tag2.id]);
  
  // Create comment
  await Comment.create({
    content: 'Great article!',
    authorId: author.id,
    postId: post.id
  });
  
  // Query examples
  const posts = await Post.query()
    .where({ publishedAt: { $isNotNull: true } })
    .order('createdAt', 'DESC')
    .take(10)
    .include('author', 'category', 'tags')
    .get();
  
  const postWithComments = await Post.findById(post.id);
  const comments = await Comment.query()
    .where({ postId: post.id })
    .include('author')
    .get();
  
  await orm.disconnect();
}

main().catch(console.error);
```

---

## API Reference

### UltraORM Class

```javascript
const orm = new UltraORM(config);

// Connection
await orm.connect();
await orm.disconnect();

// Model management
orm.registerModel(User);
orm.model('users');  // Get model by table name

// Migrations
await orm.migrate();
await orm.migrateRun();
await orm.migrateRollback();
await orm.migrateReset();

// Transactions
await orm.transaction(async (client) => { ... });

// Utilities
await orm.tableExists('users');
await orm.getTables();
await orm.truncate('users');
orm.raw('NOW()');  // Raw SQL expression
```

### Model Class

```javascript
// Static methods
User.create(data);           // Create and save
User.find(where);             // Find all
User.findOne(where);         // Find one
User.findById(id);           // Find by ID
User.findOrFail(id);         // Find or throw NotFoundError
User.firstOrCreate(where, data);  // Find or create
User.updateOrCreate(where, data);   // Update or create
User.count(where);           // Count records
User.exists(where);          // Check existence
User.query();                // Create QuerySet
User.sync();                 // Sync table
User.bulkCreate(records);    // Bulk insert

// Instance methods
user.save();       // Insert or update
user.delete();     // Delete record
user.refresh();    // Reload from DB
user.validate();   // Validate fields
user.toJSON();     // Convert to JSON

// Relationships
user.posts;        // Get related (via eager load)
await user.attach('roles', [1, 2]);
await user.detach('roles', [1]);
await user.sync('roles', [2, 3]);
await user.toggle('roles', [1]);
```

### QuerySet Methods

```javascript
// Filtering
.where(conditions)
.orWhere(conditions)
.whereOp(field, operator, value)
.whereIn(field, values)
.whereNotIn(field, values)
.whereNull(field)
.whereNotNull(field)
.whereBetween(field, range)
.whereNotBetween(field, range)
.whereLike(field, pattern)
.search(field, value)

// Ordering
.order(field, direction)
.orderBy(field, direction)
.orderByMultiple(fields)

// Pagination
.take(n)           // LIMIT n
.skip(n)           // OFFSET n
.limit(n)          // Alias for take
.offset(n)         // Alias for skip
.paginate(page, perPage)

// Selection
.select(fields)
.distinct(field)

// Eager loading
.include(relations)
.with(relations)

// Execution
.get()            // Get all results
.first()          // Get first result
.firstOrFail(msg) // Get first or throw
.value(field)     // Get single value
.values(...fields)  // Get as objects
.count()          // Count records
.exists()         // Check existence
.aggregate(op, field)  // SUM, AVG, MIN, MAX, COUNT
.sum(field)
.avg(field)
.min(field)
.max(field)

// Bulk operations
.update(data)     // Update matching
.delete()         // Delete matching
.increment(field, amount)
.decrement(field, amount)
```

---

## Error Handling

### Error Types

```javascript
const { UltraORMError, ValidationError, NotFoundError, DatabaseError } = require('ultraorm');

// Validation errors (field validation)
try {
  user.save();
} catch (ValidationError e) {
  console.log(e.field);  // The field that failed
  console.log(e.message);
}

// Not found errors
try {
  const user = await User.findOrFail(id);
} catch (NotFoundError e) {
  console.log(e.model);  // Model table name
}

// Database errors
try {
  await orm.connect();
} catch (DatabaseError e) {
  console.log(e.originalError);  // Original error
}
```

### Best Practices

```javascript
// Always wrap in try-catch
try {
  const user = await User.create(data);
} catch (ValidationError e) {
  // Handle validation errors
  console.log(e.field.name, e.message);
} catch (DatabaseError e) {
  // Handle database errors
  console.error(e.message);
}
```

---

## Best Practices

### Security

```javascript
// Always validate user input
User.validate();  // Validate before save

// Use parameterized queries (automatic in UltraORM)
await User.query().where({ email: userInput });  // Safe

// Escape identifiers (automatic in UltraORM)
await User.query().where({ 'malicious_field'; DROP TABLE users; --': value });  // Safe
```

### Performance

```javascript
// Use eager loading to avoid N+1 queries
const posts = await Post.query()
  .include('author', 'category', 'tags')
  .get();

// Use pagination for large datasets
const { items, pagination } = await Post.query().paginate(page, perPage);

// Use select() to limit columns
const names = await User.query().select('name').get();

// Use indexes for frequently queried fields
static fields = {
  email: new StringField({ unique: true, index: true })
};
```

### Code Organization

```javascript
// models/User.js
const { Model, StringField, IntegerField, DateTimeField } = require('ultraorm');

class User extends Model {
  static tableName = 'users';
  static fields = {
    // Define fields
  };
  
  // Static methods for model-specific queries
  static async findByEmail(email) {
    return this.findOne({ email });
  }
  
  static async findAdmins() {
    return this.query()
      .where({ role: 'admin' })
      .get();
  }
}

module.exports = User;
```

---

## Roadmap

### Version 2.1.0 (Planned)
- [ ] TypeScript definitions improvement
- [ ] Query caching layer
- [ ] Database replication support
- [ ] Soft delete support (paranoid)
- [ ] Observer pattern for model events

### Version 2.2.0 (Planned)
- [ ] Full-text search support
- [ ] Database sharding helpers
- [ ] Automatic query optimization hints
- [ ] GraphQL integration
- [ ] Redis caching adapter

### Version 3.0.0 (Future)
- [ ] MongoDB aggregation pipeline builder
- [ ] Multi-tenancy support
- [ ] GraphQL schema generation
- [ ] Real-time subscriptions (WebSocket)
- [ ] Database migration versioning UI

### Planned Field Types
- [ ] IPAddressField
- [ ] ColorField (hex color picker)
- [ ] FileField / ImageField (with upload handling)
- [ ] PhoneNumberField
- [ ] CreditCardField (with Luhn validation)

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

```bash
# Clone the repository
git clone https://github.com/yourusername/ultraorm.git

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

---

## License

MIT License - Copyright (c) 2024 UltraORM Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

## Support

- 📖 Documentation: [docs.ultraorm.dev](https://docs.ultraorm.dev)
- 💬 Discord: [Join our community](https://discord.gg/ultraorm)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/ultraorm/issues)
- 📧 Email: support@ultraorm.dev

---

<p align="center">
  <strong>Built with ❤️ for the Node.js community</strong>
</p>
