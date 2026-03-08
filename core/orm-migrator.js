// orm-bootstrap.js
// Usage: require('./orm-bootstrap') to get a constructed UltraORM instance.
// This file does NOT automatically call connect; call connect() in your app entrypoint.

const { UltraORM } = require('./ultra-orm');

const orm = new UltraORM({
  type: process.env.DB_TYPE || 'mysql', // 'mysql' | 'postgres' | 'mongodb'
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'ultra_orm_example',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
  url: process.env.MONGO_URL || undefined // for mongodb set MONGO_URL instead
});

module.exports = orm;