/**
 * ================================================================================
 * UltraORM - Bootstrap Module
 * ================================================================================
 * 
 * This is the bootstrap file that initializes UltraORM and auto-loads models
 * from the models directory. This provides a convenient way to set up the ORM
 * with all models automatically registered.
 * 
 * USAGE:
 * 
 * // Option 1: Import the pre-configured ORM
 * const orm = require('ultraorm/bootstrap');
 * 
 * // Option 2: Import classes separately
 * const { Model, UltraORM, StringField } = require('ultraorm');
 * 
 * // Option 3: Create your own instance
 * const { UltraORM } = require('ultraorm');
 * const orm = new UltraORM({
 *   type: 'postgres',
 *   host: 'localhost',
 *   database: 'mydb',
 *   user: 'user',
 *   password: 'password'
 * });
 * 
 * ================================================================================
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load environment variables from .env file
require('dotenv').config();

// Import UltraORM core
const Core = require('./core');
const { UltraORM, Model, Field, UltraORMError } = Core;

// ==================== CONFIGURATION ====================

/**
 * Database configuration from environment variables
 * 
 * Supported environment variables:
 * - DB_TYPE: 'postgres', 'mysql', or 'mongodb' (default: 'postgres')
 * - DB_HOST: Database host (default: 'localhost')
 * - DB_PORT: Database port (default: 5432 for postgres, 3306 for mysql, 27017 for mongodb)
 * - DB_USER: Database user
 * - DB_PASSWORD: Database password
 * - DB_NAME: Database name
 * - DB_URL: MongoDB connection URL (alternative to individual settings)
 * - DB_POOL_SIZE: Connection pool size (default: 10-20 based on database type)
 */
const dbConfig = {
  type: process.env.DB_TYPE || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || (process.env.DB_TYPE === 'mysql' ? '3306' : (process.env.DB_TYPE === 'mongodb' ? '27017' : '5432'))),
  url: process.env.DB_URL,
  poolSize: parseInt(process.env.DB_POOL_SIZE) || null,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
};

// ==================== CREATE ORM INSTANCE ====================

/**
 * Create and configure UltraORM instance
 * This is the main entry point for most use cases
 */
const orm = new UltraORM(dbConfig);

// ==================== AUTO-LOAD MODELS ====================

/**
 * Auto-load all model files from the models directory
 * 
 * Model files should export a Model class:
 * 
 * // models/User.js
 * const { Model, StringField, IntegerField } = require('ultraorm');
 * 
 * class User extends Model {
 *   static tableName = 'users';
 *   static fields = {
 *     id: new IntegerField({ primaryKey: true }),
 *     name: new StringField({ nullable: false }),
 *     email: new StringField({ unique: true })
 *   };
 * }
 * 
 * module.exports = User;
 */

/**
 * Register a model with the ORM
 * @param {string} modelPath - Path to the model file
 */
function registerModelFile(modelPath) {
  try {
    // Clear require cache to allow hot reloading
    delete require.cache[require.resolve(modelPath)];
    
    const ModelClass = require(modelPath);
    
    // Check if it's a valid Model class
    if (ModelClass && ModelClass.prototype instanceof Model) {
      orm.registerModel(ModelClass);
      console.log(`[UltraORM] Loaded model: ${ModelClass.name} (table: ${ModelClass.tableName})`);
    } else {
      console.warn(`[UltraORM] Warning: ${path.basename(modelPath)} does not export a valid Model class`);
    }
  } catch (err) {
    console.error(`[UltraORM] Error loading model ${path.basename(modelPath)}:`, err.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(err.stack);
    }
  }
}

/**
 * Scan and load all models from a directory
 * @param {string} modelsDir - Path to models directory
 */
function loadModelsFromDirectory(modelsDir) {
  if (!fs.existsSync(modelsDir)) {
    console.warn(`[UltraORM] Models directory not found: ${modelsDir}`);
    return;
  }

  const modelFiles = fs.readdirSync(modelsDir)
    .filter(f => f.endsWith('.js'))
    .sort(); // Sort for consistent loading order

  console.log(`[UltraORM] Scanning models folder: ${modelsDir}`);
  console.log(`[UltraORM] Found ${modelFiles.length} model file(s)`);

  for (const file of modelFiles) {
    const modelPath = path.join(modelsDir, file);
    registerModelFile(modelPath);
  }

  console.log(`[UltraORM] Registered ${orm.models.size} model(s)`);
}

// Auto-load models from default location
const modelsDir = path.join(process.cwd(), 'models');
if (fs.existsSync(modelsDir)) {
  loadModelsFromDirectory(modelsDir);
} else {
  console.log(`[UltraORM] No models directory found at ${modelsDir}`);
  console.log('[UltraORM] Create a "models" folder and add your model files');
}

// ==================== EXPORTS ====================

/**
 * Export the configured ORM instance
 * This is the main export for most use cases
 */
module.exports = orm;

/**
 * Also export individual components for advanced usage
 * 
 * @example
 * const orm = require('ultraorm/bootstrap');
 * const { Model, StringField } = require('ultraorm/bootstrap');
 */
module.exports.Model = Model;
module.exports.UltraORM = UltraORM;
module.exports.Field = Field;

// Export all field types
module.exports.StringField = Core.StringField;
module.exports.CharField = Core.CharField;
module.exports.TextField = Core.TextField;
module.exports.IntegerField = Core.IntegerField;
module.exports.BigIntegerField = Core.BigIntegerField;
module.exports.SmallIntegerField = Core.SmallIntegerField;
module.exports.TinyIntegerField = Core.TinyIntegerField;
module.exports.DecimalField = Core.DecimalField;
module.exports.FloatField = Core.FloatField;
module.exports.BooleanField = Core.BooleanField;
module.exports.DateField = Core.DateField;
module.exports.TimeField = Core.TimeField;
module.exports.DateTimeField = Core.DateTimeField;
module.exports.EmailField = Core.EmailField;
module.exports.SlugField = Core.SlugField;
module.exports.URLField = Core.URLField;
module.exports.UUIDField = Core.UUIDField;
module.exports.EnumField = Core.EnumField;
module.exports.JSONField = Core.JSONField;
module.exports.BinaryField = Core.BinaryField;
module.exports.ForeignKey = Core.ForeignKey;
module.exports.OneToOneField = Core.OneToOneField;

// Export error classes
module.exports.UltraORMError = Core.UltraORMError;
module.exports.ValidationError = Core.ValidationError;
module.exports.NotFoundError = Core.NotFoundError;
module.exports.DatabaseError = Core.DatabaseError;

// Export utilities
module.exports.loadModelsFromDirectory = loadModelsFromDirectory;
module.exports.registerModelFile = registerModelFile;
module.exports.dbConfig = dbConfig;

// ==================== HELPERS ====================

/**
 * Helper to quickly set up a development database
 * 
 * @param {Object} options - Configuration options
 * @returns {UltraORM} - Configured ORM instance
 * 
 * @example
 * // Quick development setup
 * const orm = require('ultraorm/bootstrap').dev({
 *   type: 'postgres',
 *   database: 'myapp_dev'
 * });
 */
orm.dev = function(options = {}) {
  const devConfig = {
    ...dbConfig,
    ...options,
    database: options.database || (dbConfig.database + '_dev')
  };
  
  const devOrm = new UltraORM(devConfig);
  const devModelsDir = path.join(process.cwd(), 'models');
  
  if (fs.existsSync(devModelsDir)) {
    loadModelsFromDirectory.call({ orm: devOrm }, devModelsDir);
  }
  
  return devOrm;
};

/**
 * Helper to quickly set up a test database
 * 
 * @param {Object} options - Configuration options
 * @returns {UltraORM} - Configured ORM instance
 * 
 * @example
 * const orm = require('ultraorm/bootstrap').test({
 *   database: 'myapp_test'
 * });
 */
orm.test = function(options = {}) {
  const testConfig = {
    ...dbConfig,
    ...options,
    database: options.database || (dbConfig.database + '_test')
  };
  
  return new UltraORM(testConfig);
};

/**
 * Connect and optionally run migrations
 * 
 * @param {boolean} runMigrations - Whether to run migrations
 * @returns {Promise<UltraORM>} - Connected ORM instance
 * 
 * @example
 * await require('ultraorm/bootstrap').connectAndMigrate();
 */
orm.connectAndMigrate = async function(runMigrations = true) {
  await this.connect();
  if (runMigrations) {
    await this.migrate();
  }
  return this;
};

// Export helper functions
module.exports.connectAndMigrate = function(runMigrations = true) {
  return orm.connectAndMigrate(runMigrations);
};
