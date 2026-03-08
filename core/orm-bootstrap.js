/*
// orm-bootstrap.js
require('dotenv').config();

const { UltraORM } = require('./ultra-orm');

const orm = new UltraORM({
  type: process.env.DB_TYPE || 'mongodb',

  // SQL (ignored for Mongo)
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,

  // Common
  database: process.env.DB_NAME || 'ultra_orm_example',

  // Mongo ONLY — must be `url`, not `mongoUrl`
  url: process.env.MONGO_URL
});

module.exports = orm;
*/



// orm-bootstrap.js
const { UltraORM } = require('./ultra-orm'); // your ORM file

// PostgreSQL configuration
const orm = new UltraORM({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'admin',
  database: 'postgres'
});

module.exports = orm;