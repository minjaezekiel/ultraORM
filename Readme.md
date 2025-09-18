

# UltraORM - A Lightweight Multi-Database ORM for Node.js

UltraORM is a flexible, lightweight Object-Relational Mapping (ORM) library for Node.js that provides a unified interface for working with multiple database systems including PostgreSQL, MySQL, and MongoDB. It offers an elegant way to define models, perform validations, and execute database operations with minimal boilerplate code.

## Features

- **Multi-Database Support**: Works with PostgreSQL, MySQL, and MongoDB
- **Model Definition**: Decorator-based model definition with type safety
- **Field Types**: Rich set of field types with built-in validation
- **Query Builder**: Fluent QuerySet API for building complex queries
- **Relationships**: Support for foreign key relationships
- **Migrations**: Automatic table creation and schema synchronization
- **Transactions**: ACID transaction support
- **Pagination**: Built-in pagination helpers
- **Validation**: Comprehensive field validation with custom validators

## Installation

```bash
npm install ultra-orm
```

## Setup

### Database Configuration

```javascript
const { UltraORM } = require('ultra-orm');

// PostgreSQL configuration
const orm = new UltraORM({
  type: 'postgres',
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'myapp',
  port: 5432
});

// MySQL configuration
const orm = new UltraORM({
  type: 'mysql',
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'myapp',
  port: 3306
});

// MongoDB configuration
const orm = new UltraORM({
  type: 'mongodb',
  url: 'mongodb://localhost:27017',
  database: 'myapp'
});
```

### Connecting to the Database

```javascript
async function initialize() {
  await orm.connect();
  console.log('Connected to database');
  
  // Register models here
  // ...
  
  // Run migrations
  await orm.migrate();
}

initialize().catch(console.error);
```

## Basic Usage

### Defining Models

```javascript
const { Model, field, model, IntegerField, StringField, EmailField, DateTimeField, BooleanField, ForeignKey } = require('ultra-orm');

// Define a User model
@model('users')
class User extends Model {
  @field(IntegerField, { primaryKey: true, autoIncrement: true })
  id;
  
  @field(StringField, { maxLength: 100 })
  name;
  
  @field(EmailField)
  email;
  
  @field(BooleanField, { default: false })
  isActive;
  
  @field(DateTimeField, { autoNowAdd: true })
  createdAt;
}

// Define a Post model with a foreign key to User
@model('posts')
class Post extends Model {
  @field(IntegerField, { primaryKey: true, autoIncrement: true })
  id;
  
  @field(StringField, { maxLength: 255 })
  title;
  
  @field(StringField)
  content;
  
  @field(DateTimeField, { autoNow: true })
  updatedAt;
  
  @field(ForeignKey, () => User)
  authorId;
}

// Register models with the ORM
orm.registerModel(User);
orm.registerModel(Post);
```

### Creating Records

```javascript
async function createUser() {
  const user = new User({
    name: 'John Doe',
    email: 'john@example.com'
  });
  
  await user.save();
  console.log('User created with ID:', user.id);
  return user;
}
```

### Querying Records

```javascript
// Find all users
const users = await User.query().get();

// Find a user by ID
const user = await User.findOne({ id: 1 });

// Query with conditions
const activeUsers = await User.query()
  .where({ isActive: true })
  .order('name', 'ASC')
  .get();

// Pagination
const page = await User.query()
  .where({ isActive: true })
  .paginate(1, 10); // page 1, 10 items per page

console.log(`Found ${page.pagination.total} active users`);
```

### Updating Records

```javascript
async function updateUserEmail(userId, newEmail) {
  const user = await User.findOne({ id: userId });
  if (user) {
    user.set('email', newEmail);
    await user.save();
    console.log('User email updated');
  }
}
```

### Deleting Records

```javascript
async function deleteUser(userId) {
  const user = await User.findOne({ id: userId });
  if (user) {
    await user.delete();
    console.log('User deleted');
  }
}
```

### Working with Relationships

```javascript
// Create a post for a user
async function createPostForUser(userId, title, content) {
  const post = new Post({
    title,
    content,
    authorId: userId
  });
  
  await post.save();
  return post;
}

// Get all posts by a user
async function getUserPosts(userId) {
  return await Post.query()
    .where({ authorId: userId })
    .order('updatedAt', 'DESC')
    .get();
}
```

### Transactions

```javascript
async function transferFunds(fromUserId, toUserId, amount) {
  await orm.transaction(async (connection) => {
    // In a real application, you would update user balances here
    // This is just a demonstration of the transaction API
    console.log(`Transferring ${amount} from user ${fromUserId} to user ${toUserId}`);
    
    // If any operation fails, the transaction will be rolled back
    // throw new Error('Insufficient funds'); // This would cause a rollback
  });
}
```

## API Reference

### Field Types

- `IntegerField`: For integer values with optional min/max validation
- `BigIntegerField`: For large integer values
- `StringField`: For text with optional length constraints and pattern matching
- `EmailField`: For email addresses with built-in validation
- `DateTimeField`: For date and time values with auto-now options
- `BooleanField`: For true/false values
- `JSONField`: For JSON data storage
- `FloatField`: For floating-point numbers
- `ForeignKey`: For establishing relationships between models

### QuerySet Methods

- `where(conditions)`: Add WHERE conditions
- `order(field, direction)`: Add ORDER BY clause
- `take(limit)`: Limit results
- `skip(offset)`: Skip results
- `include(relation)`: Include related models (for future expansion)
- `select(fields)`: Select specific fields
- `get()`: Execute query and return results
- `first()`: Get first result only
- `count()`: Count matching records
- `paginate(page, perPage)`: Get paginated results

## Code Review

### Strengths

1. **Clean Architecture**: The code is well-organized with clear separation of concerns between field definitions, query building, and model operations.

2. **Multi-Database Support**: The ORM provides a unified API for different database systems, making it easier to switch between databases.

3. **Validation System**: The built-in field validation is comprehensive and extensible, ensuring data integrity.

4. **Fluent Query API**: The QuerySet class provides an intuitive, chainable interface for building queries.

5. **Decorator-Based Model Definition**: The use of decorators makes model definitions clean and readable.

### Areas for Improvement

1. **MongoDB Support**: While MongoDB is listed as supported, the current implementation appears to be SQL-focused. The MongoDB implementation would need significant work to fully support document operations.

2. **Relationship Handling**: The current implementation only supports foreign keys. Adding ManyToMany and OneToOne relationships would enhance the ORM's capabilities.

3. **Advanced Query Features**: Joins, subqueries, and aggregations are not yet implemented.

4. **Hooks and Events**: Adding lifecycle hooks (beforeSave, afterSave, etc.) would allow for more flexible business logic.

5. **TypeScript Support**: Adding TypeScript definitions would improve developer experience and type safety.

## What Contributors Can Add

1. **Additional Field Types**: 
   - ArrayField for storing arrays
   - BinaryField for binary data
   - EnumField for enumerated values
   - Geographic fields for spatial data

2. **Relationship Enhancements**:
   - ManyToMany relationships with join tables
   - OneToOne relationships
   - Eager loading of related models

3. **Query Builder Improvements**:
   - Support for JOIN operations
   - Aggregation functions (COUNT, SUM, AVG, etc.)
   - Group By and Having clauses
   - Subquery support

4. **Migration System**:
   - Versioned migrations with up/down functions
   - Migration history tracking
   - Schema diffing tools

5. **Performance Optimizations**:
   - Query caching
   - Connection pooling enhancements
   - Batch insert/update operations

6. **Developer Experience**:
   - TypeScript definitions
   - Debug mode with query logging
   - Comprehensive error messages
   - Plugin system for extensions

7. **Documentation and Examples**:
   - More detailed API documentation
   - Real-world application examples
   - Tutorial for beginners

## Contributing

We welcome contributions to UltraORM! Here's how you can help:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

Please follow the existing code style and add appropriate documentation for any new features.

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions, please open an issue on the GitHub repository.