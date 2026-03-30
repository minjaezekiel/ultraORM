/**
 * ================================================================================
 * UltraORM - The Ultimate Node.js ORM for PostgreSQL, MySQL, and MongoDB
 * ================================================================================
 * 
 * This is the core module of UltraORM. It provides a unified API for working with
 * multiple database types while maintaining Django-like ease of use.
 * 
 * ARCHITECTURE OVERVIEW:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           USER APPLICATION                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         FIELD CLASSES                                    │
 * │  (StringField, IntegerField, ForeignKey, DateTimeField, etc.)           │
 * │                                                                          │
 * │  These define data types, validation rules, and SQL generation.         │
 * │  DO NOT modify unless adding new field types.                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                         MODEL CLASS                                      │
 * │                                                                          │
 * │  Represents database tables. Contains:                                  │
 * │  - Static methods for queries (find, create, count, etc.)               │
 * │  - Instance methods for CRUD operations (save, delete, update)         │
 * │  - Relationship definitions (hasMany, belongsTo, etc.)                 │
 * │                                                                          │
 * │  🔹 IMPORTANT: To add new query methods, modify this class.             │
 * │  🔹 Relationships are defined via static methods.                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                       QUERYSET CLASS                                     │
 * │                                                                          │
 * │  Chainable query builder for complex database queries.                  │
 * │  Methods: where(), order(), include(), take(), skip(), paginate()       │
 * │                                                                          │
 * │  🔹 IMPORTANT: Add new query methods here.                               │
 * │  🔹 Query optimization goes here.                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                       DBADAPTER CLASS                                    │
 * │                                                                          │
 * │  Database-agnostic adapter that handles:                                │
 * │  - Connection pooling                                                   │
 * │  - Query execution                                                     │
 * │  - Transaction management                                               │
 * │  - Database-specific SQL translation                                   │
 * │                                                                          │
 * │  🔹 IMPORTANT: Add new database adapters here.                          │
 * │  🔹 SQL generation and placeholders handled here.                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                        ULTRAORM CLASS                                    │
 * │                                                                          │
 * │  Main entry point. Manages:                                            │
 * │  - Model registration                                                   │
 * │  - Connection lifecycle                                                 │
 * │  - Migration management                                                 │
 * │  - Seeding functionality                                                │
 * │  - Data transfer between databases                                      │
 * │                                                                          │
 * │  🔹 IMPORTANT: Add new ORM-level features here.                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ================================================================================
 * DEVELOPMENT GUIDELINES
 * ================================================================================
 * 
 * 1. FIELD CLASSES: Extend the Field base class to add new data types.
 *    Example: class UUIDField extends Field { ... }
 * 
 * 2. QUERYSET METHODS: Add chainable query methods here.
 *    All methods must return `this` for chaining.
 * 
 * 3. MODEL METHODS: Add static methods for model-level operations.
 *    Add instance methods for row-level operations.
 * 
 * 4. ADAPTER METHODS: Add database-specific handling for new features.
 *    Always check this.type for database-specific behavior.
 * 
 * 5. ULTRAORM METHODS: Add top-level features here.
 * 
 * ================================================================================
 */

'use strict';

// ==================== DEPENDENCIES ====================
// @developer: Do not modify this section unless adding new database support
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== ERROR HANDLING ====================
/**
 * Custom error class for UltraORM-specific errors
 * @extends Error
 */
class UltraORMError extends Error {
  constructor(message, code = 'ULTRAORM_ERROR') {
    super(message);
    this.name = 'UltraORMError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for field validation failures
 */
class ValidationError extends UltraORMError {
  constructor(message, field = null) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Not found error for query operations
 */
class NotFoundError extends UltraORMError {
  constructor(message, model = null) {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
    this.model = model;
  }
}

/**
 * Database error for database-specific failures
 */
class DatabaseError extends UltraORMError {
  constructor(message, originalError = null) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

// ==================== UTILITY FUNCTIONS ====================
/**
 * Converts camelCase to snake_case
 * @param {string} str - String to convert
 * @returns {string} - Converted string
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Converts snake_case to camelCase
 * @param {string} str - String to convert
 * @returns {string} - Converted string
 */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Deep clones an object
 * @param {*} obj - Object to clone
 * @returns {*} - Cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(deepClone);
  if (obj instanceof Map) {
    const cloned = new Map();
    obj.forEach((v, k) => cloned.set(deepClone(k), deepClone(v)));
    return cloned;
  }
  if (obj instanceof Set) {
    const cloned = new Set();
    obj.forEach(v => cloned.add(deepClone(v)));
    return cloned;
  }
  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Safely escapes identifier (table/column name)
 * @param {string} identifier - Identifier to escape
 * @param {string} adapterType - Database adapter type
 * @returns {string} - Escaped identifier
 */
function escapeIdentifier(identifier, adapterType = 'mysql') {
  if (!identifier || typeof identifier !== 'string') {
    throw new UltraORMError('Invalid identifier');
  }
  
  // Handle quoted identifiers like "userId"
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier;
  }
  
  if (adapterType === 'postgres') {
    return `"${identifier.replace(/"/g, '""')}"`;
  } else if (adapterType === 'mysql') {
    return `\`${identifier.replace(/`/g, '``')}\``;
  }
  return identifier;
}

// ==================== FIELD TYPES ====================
/**
 * Base Field class for all field types
 * 
 * @class Field
 * @extends null
 * 
 * OPTIONS:
 * - primaryKey {boolean} - Set as primary key (auto-increments)
 * - unique {boolean} - Unique constraint
 * - nullable {boolean} - Allow NULL values (default: true)
 * - default {*} - Default value (can be function)
 * - autoIncrement {boolean} - Auto-increment for integers
 * - validators {Array} - Custom validation functions
 * - dbType {string} - Database-specific type
 * - onDelete {string} - ON DELETE action for foreign keys
 * - onUpdate {string} - ON UPDATE action for foreign keys
 * 
 * @example
 * new Field({ primaryKey: true, nullable: false, default: 'N/A' })
 */
class Field {
  constructor(options = {}) {
    this.primaryKey = options.primaryKey || false;
    this.unique = options.unique || false;
    this.nullable = options.nullable ?? true;
    this.default = options.default;
    this.autoIncrement = options.autoIncrement || false;
    this.validators = options.validators || [];
    this.dbType = options.dbType;
    this.index = options.index || false;
    this.description = options.description || null;
  }

  /**
   * Validate a value against this field's constraints
   * @param {*} value - Value to validate
   * @returns {boolean} - True if valid
   * @throws {ValidationError} - If validation fails
   */
  validate(value) {
    if (!this.nullable && (value === null || value === undefined)) {
      throw new ValidationError('Field cannot be null', this);
    }
    for (const validator of this.validators) {
      validator(value);
    }
    return true;
  }

  /**
   * Generate SQL definition for this field
   * @param {string} fieldName - Name of the field
   * @param {string} adapterType - Database adapter type ('mysql', 'postgres', 'mongodb')
   * @returns {string} - SQL definition
   */
  getSQLDefinition(fieldName, adapterType = 'mysql') {
    let dbType = this.dbType || 'TEXT';
    let parts = [escapeIdentifier(fieldName, adapterType), dbType];

    if (this.autoIncrement && adapterType === 'postgres') {
      parts = [escapeIdentifier(fieldName, adapterType), 'SERIAL'];
    }
    
    if (this.autoIncrement && adapterType === 'mysql') {
      parts.push('AUTO_INCREMENT');
    }

    if (this.primaryKey && !this.autoIncrement) {
      parts.push('PRIMARY KEY');
    }

    if (!this.nullable && !this.autoIncrement) {
      parts.push('NOT NULL');
    }

    if (this.unique) {
      parts.push('UNIQUE');
    }

    if (this.default !== undefined && this.default !== null) {
      const defaultValue = typeof this.default === 'function' 
        ? this.default() 
        : (typeof this.default === 'string' ? `'${this.default}'` : this.default);
      parts.push(`DEFAULT ${defaultValue}`);
    }

    return parts.join(' ');
  }

  /**
   * Convert value for database storage
   * @param {*} value - Value to prepare
   * @returns {*} - Prepared value
   */
  prepareValue(value) {
    if (value === undefined) return null;
    if (value instanceof Date) return value;
    return value;
  }

  /**
   * Convert value from database
   * @param {*} value - Value from database
   * @returns {*} - Converted value
   */
  fromDatabase(value) {
    return value;
  }
}

/**
 * IntegerField - For integer values
 * 
 * @extends Field
 * 
 * OPTIONS (in addition to Field options):
 * - min {number} - Minimum value
 * - max {number} - Maximum value
 * - unsigned {boolean} - Unsigned integer (MySQL)
 * 
 * @example
 * new IntegerField({ min: 0, max: 100, default: 0 })
 */
class IntegerField extends Field {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.unsigned = options.unsigned || false;
    this.dbType = this.unsigned ? 'INT UNSIGNED' : (options.dbType || 'INT');
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new ValidationError('Must be an integer', this);
      }
      if (this.min !== undefined && value < this.min) {
        throw new ValidationError(`Must be at least ${this.min}`, this);
      }
      if (this.max !== undefined && value > this.max) {
        throw new ValidationError(`Must be at most ${this.max}`, this);
      }
    }
  }
}

/**
 * BigIntegerField - For large integer values
 * @extends IntegerField
 */
class BigIntegerField extends IntegerField {
  constructor(options = {}) {
    super(options);
    this.dbType = this.unsigned ? 'BIGINT UNSIGNED' : 'BIGINT';
  }
}

/**
 * SmallIntegerField - For small integer values
 * @extends IntegerField
 */
class SmallIntegerField extends IntegerField {
  constructor(options = {}) {
    super(options);
    this.dbType = this.unsigned ? 'SMALLINT UNSIGNED' : 'SMALLINT';
  }
}

/**
 * TinyIntegerField - For tiny integer values (0-255)
 * @extends IntegerField
 */
class TinyIntegerField extends IntegerField {
  constructor(options = {}) {
    super({ ...options, max: options.max || 255 });
    this.dbType = this.unsigned ? 'TINYINT UNSIGNED' : 'TINYINT';
  }
}

/**
 * DecimalField - For precise decimal values
 * 
 * @extends Field
 * 
 * OPTIONS:
 * - precision {number} - Total number of digits
 * - scale {number} - Number of decimal places
 * - maxDigits {number} - Alias for precision
 * - decimalPlaces {number} - Alias for scale
 * 
 * @example
 * new DecimalField({ precision: 10, scale: 2 }) // For prices
 */
class DecimalField extends Field {
  constructor(options = {}) {
    super(options);
    this.precision = options.precision || options.maxDigits || 10;
    this.scale = options.scale || options.decimalPlaces || 2;
    this.dbType = `DECIMAL(${this.precision},${this.scale})`;
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number') {
        throw new ValidationError('Must be a number', this);
      }
      // Check precision
      const str = String(value);
      const [intPart, decPart = ''] = str.split('.');
      if (intPart.replace('-', '').length > this.precision - this.scale) {
        throw new ValidationError(`Value exceeds maximum precision of ${this.precision}`, this);
      }
    }
  }

  prepareValue(value) {
    if (typeof value === 'string') {
      return parseFloat(value);
    }
    return value;
  }
}

/**
 * StringField - For string/varchar values
 * 
 * @extends Field
 * 
 * OPTIONS:
 * - maxLength {number} - Maximum string length
 * - minLength {number} - Minimum string length
 * - pattern {RegExp} - Regex pattern to match
 * 
 * @example
 * new StringField({ maxLength: 255, nullable: false })
 */
class StringField extends Field {
  constructor(options = {}) {
    super(options);
    this.maxLength = options.maxLength;
    this.minLength = options.minLength;
    this.pattern = options.pattern;
    this.trim = options.trim || false;
    this.dbType = this.maxLength 
      ? `VARCHAR(${this.maxLength})` 
      : (options.dbType || 'VARCHAR(255)');
  }

  validate(value) {
    if (this.trim && typeof value === 'string') {
      value = value.trim();
    }
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string') {
        throw new ValidationError('Must be a string', this);
      }
      if (this.maxLength && value.length > this.maxLength) {
        throw new ValidationError(`Maximum length exceeded: ${this.maxLength}`, this);
      }
      if (this.minLength && value.length < this.minLength) {
        throw new ValidationError(`Minimum length required: ${this.minLength}`, this);
      }
      if (this.pattern && !this.pattern.test(value)) {
        throw new ValidationError('Pattern validation failed', this);
      }
    }
    return true;
  }
}

/**
 * CharField - Alias for StringField with default maxLength
 * 
 * @extends StringField
 * 
 * @example
 * new CharField() // VARCHAR(255) by default
 * new CharField({ maxLength: 100 })
 */
class CharField extends StringField {
  constructor(options = {}) {
    super({ ...options, maxLength: options.maxLength || 255 });
    this.dbType = `VARCHAR(${this.maxLength})`;
  }
}

/**
 * TextField - For long text content
 * 
 * @extends Field
 * 
 * OPTIONS:
 * - medium {boolean} - Use MEDIUMTEXT instead of TEXT
 * - long {boolean} - Use LONGTEXT instead of TEXT
 * 
 * @example
 * new TextField() // TEXT
 * new TextField({ medium: true }) // MEDIUMTEXT
 */
class TextField extends Field {
  constructor(options = {}) {
    super(options);
    if (options.long) {
      this.dbType = 'LONGTEXT';
    } else if (options.medium) {
      this.dbType = 'MEDIUMTEXT';
    } else {
      this.dbType = 'TEXT';
    }
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined && typeof value !== 'string') {
      throw new ValidationError('Must be a string', this);
    }
  }
}

/**
 * EmailField - For email addresses
 * 
 * @extends StringField
 * 
 * Automatically validates email format using regex
 * 
 * @example
 * new EmailField({ unique: true, nullable: false })
 */
class EmailField extends StringField {
  constructor(options = {}) {
    super({
      ...options,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      maxLength: options.maxLength || 255
    });
  }
}

/**
 * SlugField - For URL-friendly strings
 * 
 * @extends StringField
 * 
 * Automatically validates alphanumeric and hyphens/underscores only
 * 
 * @example
 * new SlugField({ maxLength: 100 })
 */
class SlugField extends StringField {
  constructor(options = {}) {
    super({
      ...options,
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      maxLength: options.maxLength || 255
    });
  }
}

/**
 * URLField - For URLs
 * 
 * @extends StringField
 * 
 * @example
 * new URLField({ maxLength: 2048 })
 */
class URLField extends StringField {
  constructor(options = {}) {
    super({
      ...options,
      pattern: /^https?:\/\/.+/,
      maxLength: options.maxLength || 2048
    });
  }
}

/**
 * UUIDField - For UUID values
 * 
 * @extends StringField
 * 
 * @example
 * new UUIDField({ default: () => crypto.randomUUID() })
 */
class UUIDField extends StringField {
  constructor(options = {}) {
    super({
      ...options,
      maxLength: options.maxLength || 36,
      default: options.default || (() => crypto.randomUUID())
    });
    this.dbType = 'CHAR(36)';
  }

  validate(value) {
    // UUID validation regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (value !== null && value !== undefined) {
      if (!uuidRegex.test(value)) {
        throw new ValidationError('Must be a valid UUID', this);
      }
    }
    return super.validate(value);
  }
}

/**
 * EnumField - For enum values
 * 
 * @extends Field
 * 
 * @example
 * new EnumField({ values: ['active', 'inactive', 'pending'] })
 * new EnumField({ values: ['male', 'female'], name: 'gender_type' })
 */
class EnumField extends Field {
  constructor(options = {}) {
    super(options);
    this.values = options.values || [];
    this.enumName = options.name;
    
    if (!this.values || this.values.length === 0) {
      throw new UltraORMError('EnumField requires values array');
    }
    
    // Build dbType based on adapter
    this.dbType = `ENUM('${this.values.join("','")}')`;
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (!this.values.includes(value)) {
        throw new ValidationError(`Value must be one of: ${this.values.join(', ')}`, this);
      }
    }
  }
}

/**
 * DateTimeField - For date and time values
 * 
 * @extends Field
 * 
 * OPTIONS:
 * - autoNow {boolean} - Set to current time on every save
 * - autoNowAdd {boolean} - Set to current time only on create
 * - timezone {string} - Timezone for the field (e.g., 'UTC', 'America/New_York')
 * - useTz {boolean} - Store timezone-aware timestamps
 * 
 * @example
 * new DateTimeField({ autoNow: true }) // Updates on every save
 * new DateTimeField({ autoNowAdd: true }) // Only set on creation
 * new DateTimeField({ timezone: 'UTC', useTz: true }) // Timezone-aware
 */
class DateTimeField extends Field {
  constructor(options = {}) {
    super(options);
    this.autoNow = options.autoNow || false;
    this.autoNowAdd = options.autoNowAdd || false;
    this.timezone = options.timezone || 'UTC';
    this.useTz = options.useTz || false;
    this.dbType = this.useTz ? 'TIMESTAMPTZ' : 'TIMESTAMP';
  }

  getSQLDefinition(fieldName, adapterType = 'mysql') {
    let definition = super.getSQLDefinition(fieldName, adapterType);
    
    // Replace base type with timezone-aware type if needed
    if (this.useTz) {
      definition = definition.replace('TIMESTAMP', 'TIMESTAMPTZ');
    }
    
    if (this.autoNowAdd || this.autoNow) {
      if (adapterType === 'postgres') {
        definition += ' DEFAULT CURRENT_TIMESTAMP';
        if (this.useTz) {
          definition += ' AT TIME ZONE \'' + this.timezone + '\'';
        }
      }
    }
    return definition;
  }

  /**
   * Get current time respecting the field's timezone
   */
  getCurrentTime() {
    const now = new Date();
    if (this.timezone && this.timezone !== 'UTC') {
      return new Date(now.toLocaleString('en-US', { timeZone: this.timezone }));
    }
    return now;
  }

  prepareValue(value) {
    if (value === undefined && (this.autoNow || this.autoNowAdd)) {
      return this.getCurrentTime();
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    if (value instanceof Date) {
      return value;
    }
    return value;
  }

  fromDatabase(value) {
    if (value instanceof Date) {
      if (this.timezone && this.timezone !== 'UTC') {
        // Convert to specified timezone
        return new Date(value.toLocaleString('en-US', { timeZone: this.timezone }));
      }
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  }

  /**
   * Format date as ISO string with timezone
   */
  toISOString(value) {
    const date = value instanceof Date ? value : this.fromDatabase(value);
    if (this.useTz && date) {
      return date.toISOString();
    }
    return date ? date.toISOString().replace('Z', '') : null;
  }
}

/**
 * DateField - For date values only (no time)
 * 
 * @extends Field
 * 
 * @example
 * new DateField({ nullable: false })
 */
class DateField extends Field {
  constructor(options = {}) {
    super(options);
    this.dbType = 'DATE';
  }

  prepareValue(value) {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    return value;
  }

  fromDatabase(value) {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  }
}

/**
 * TimeField - For time values only (no date)
 * 
 * @extends Field
 * 
 * @example
 * new TimeField()
 */
class TimeField extends Field {
  constructor(options = {}) {
    super(options);
    this.dbType = 'TIME';
  }

  prepareValue(value) {
    if (value instanceof Date) {
      return value.toTimeString().split(' ')[0];
    }
    return value;
  }
}

/**
 * BooleanField - For true/false values
 * 
 * @extends Field
 * 
 * @example
 * new BooleanField({ default: false })
 */
class BooleanField extends Field {
  constructor(options = {}) {
    super(options);
    this.dbType = 'BOOLEAN';
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined && typeof value !== 'boolean') {
      // Also accept 0/1 or '0'/'1' or 'true'/'false'
      if (!['0', '1', 0, 1, 'true', 'false'].includes(value)) {
        throw new ValidationError('Must be a boolean', this);
      }
    }
    return true;
  }

  prepareValue(value) {
    if (value === 'false' || value === 0 || value === '0') return false;
    if (value === 'true' || value === 1 || value === '1') return true;
    return value;
  }

  fromDatabase(value) {
    if (typeof value === 'number') return Boolean(value);
    if (value === 't' || value === '1') return true;
    if (value === 'f' || value === '0') return false;
    return value;
  }
}

/**
 * JSONField - For JSON data
 * 
 * @extends Field
 * 
 * Automatically validates JSON and stores as JSON string or native JSON type
 * 
 * @example
 * new JSONField({ default: {} })
 * new JSONField({ default: [] })
 */
class JSONField extends Field {
  constructor(options = {}) {
    super(options);
    this.dbType = 'JSON';
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      try {
        JSON.stringify(value);
      } catch {
        throw new ValidationError('Must be valid JSON', this);
      }
    }
  }

  prepareValue(value) {
    if (value === undefined) return null;
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  fromDatabase(value) {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
}

/**
 * FloatField - For floating-point numbers
 * 
 * @extends Field
 * 
 * OPTIONS:
 * - min {number} - Minimum value
 * - max {number} - Maximum value
 * 
 * @example
 * new FloatField({ min: 0, max: 100 })
 */
class FloatField extends Field {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.dbType = 'FLOAT';
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number') {
        throw new ValidationError('Must be a number', this);
      }
      if (this.min !== undefined && value < this.min) {
        throw new ValidationError(`Must be at least ${this.min}`, this);
      }
      if (this.max !== undefined && value > this.max) {
        throw new ValidationError(`Must be at most ${this.max}`, this);
      }
    }
  }
}

/**
 * BinaryField - For binary data
 * 
 * @extends Field
 * 
 * OPTIONS:
 * - maxLength {number} - Maximum binary length
 * 
 * @example
 * new BinaryField({ maxLength: 1024 })
 */
class BinaryField extends Field {
  constructor(options = {}) {
    super(options);
    this.maxLength = options.maxLength;
    this.dbType = this.maxLength ? `VARBINARY(${this.maxLength})` : 'BLOB';
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (!Buffer.isBuffer(value) && typeof value !== 'string') {
        throw new ValidationError('Must be binary data', this);
      }
    }
  }
}

/**
 * ForeignKey - For foreign key relationships
 * 
 * @extends Field
 * 
 * OPTIONS:
 * - model {Model} - Target model class
 * - onDelete {string} - ON DELETE action ('CASCADE', 'SET NULL', 'RESTRICT', 'NO ACTION')
 * - onUpdate {string} - ON UPDATE action
 * - nullable {boolean} - Allow NULL values (default: false for FK)
 * 
 * @example
 * new ForeignKey(User, { onDelete: 'CASCADE' })
 * new ForeignKey(Author, { nullable: true })
 */
class ForeignKey extends Field {
  constructor(model, options = {}) {
    super({ ...options, nullable: options.nullable ?? false });
    this.model = model;
    this.onDelete = options.onDelete || 'CASCADE';
    this.onUpdate = options.onUpdate || 'CASCADE';
    this.dbType = options.dbType || 'INT';
  }

  validate(value) {
    if (!this.nullable && (value === null || value === undefined)) {
      throw new ValidationError('Foreign key cannot be null', this);
    }
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number' && typeof value !== 'string') {
        throw new ValidationError('Foreign key must be a number or string', this);
      }
    }
    return true;
  }

  getSQLDefinition(fieldName, adapterType = 'mysql') {
    const type = this.dbType || 'INT';
    return `${escapeIdentifier(fieldName, adapterType)} ${type} ${this.nullable ? 'NULL' : 'NOT NULL'}`;
  }

  getForeignKeySQL(tableName, fieldName) {
    const referencedTable = typeof this.model === 'string' 
      ? this.model 
      : (this.model.tableName || this.model);
    const refField = this.model && this.model.primaryKeyName 
      ? this.model.primaryKeyName 
      : 'id';
    return `FOREIGN KEY (${fieldName}) REFERENCES ${referencedTable}(${refField}) ON DELETE ${this.onDelete} ON UPDATE ${this.onUpdate}`;
  }
}

/**
 * OneToOneField - For one-to-one relationships
 * 
 * @extends ForeignKey
 * 
 * @example
 * new OneToOneField(User, { onDelete: 'CASCADE' })
 */
class OneToOneField extends ForeignKey {
  constructor(model, options = {}) {
    super(model, { ...options, unique: true });
    this.dbType = options.dbType || 'INT';
  }
}

// ==================== QUERY OPERATORS ====================
/**
 * Query operator mappings for building WHERE clauses
 * These operators work across all database adapters
 */
const QUERY_OPERATORS = {
  // Equality
  '$eq': (field, value) => ({ clause: `${field} = ?`, value }),
  '$ne': (field, value) => ({ clause: `${field} != ?`, value }),
  '$gt': (field, value) => ({ clause: `${field} > ?`, value }),
  '$gte': (field, value) => ({ clause: `${field} >= ?`, value }),
  '$lt': (field, value) => ({ clause: `${field} < ?`, value }),
  '$lte': (field, value) => ({ clause: `${field} <= ?`, value }),
  
  // IN operations
  '$in': (field, value) => {
    if (!Array.isArray(value)) value = [value];
    const placeholders = value.map(() => '?').join(', ');
    return { clause: `${field} IN (${placeholders})`, value };
  },
  '$notIn': (field, value) => {
    if (!Array.isArray(value)) value = [value];
    const placeholders = value.map(() => '?').join(', ');
    return { clause: `${field} NOT IN (${placeholders})`, value };
  },
  
  // NULL checks
  '$isNull': (field) => ({ clause: `${field} IS NULL`, value: null }),
  '$isNotNull': (field) => ({ clause: `${field} IS NOT NULL`, value: null }),
  
  // LIKE operations
  '$like': (field, value) => ({ clause: `${field} LIKE ?`, value }),
  '$notLike': (field, value) => ({ clause: `${field} NOT LIKE ?`, value }),
  '$startsWith': (field, value) => ({ clause: `${field} LIKE ?`, value: `${value}%` }),
  '$endsWith': (field, value) => ({ clause: `${field} LIKE ?`, value: `%${value}` }),
  '$contains': (field, value) => ({ clause: `${field} LIKE ?`, value: `%${value}%` }),
  
  // BETWEEN
  '$between': (field, value) => {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new ValidationError('$between requires array of [min, max]');
    }
    return { clause: `${field} BETWEEN ? AND ?`, value };
  },
  '$notBetween': (field, value) => {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new ValidationError('$notBetween requires array of [min, max]');
    }
    return { clause: `${field} NOT BETWEEN ? AND ?`, value };
  },
  
  // EXISTS
  '$exists': (field, value) => ({ clause: value ? `${field} IS NOT NULL` : `${field} IS NULL`, value: null }),
};

// ==================== QUERYSET CLASS ====================
/**
 * QuerySet - Chainable query builder for complex database queries
 * 
 * Provides a fluent interface for building SQL queries with support for:
 * - WHERE conditions
 * - ORDER BY
 * - LIMIT/OFFSET
 * - GROUP BY/HAVING
 * - JOIN operations
 * - Eager loading of relations
 * - Aggregation
 * 
 * @example
 * const users = await User.query()
 *   .where({ status: 'active' })
 *   .where('age', '>=', 18)
 *   .order('created_at', 'DESC')
 *   .take(10)
 *   .include('posts')
 *   .get();
 */
class QuerySet {
  /**
   * Create a new QuerySet
   * @param {Model} model - The model class this QuerySet operates on
   */
  constructor(model) {
    this.model = model;
    this._whereConditions = [];
    this._orConditions = [];
    this._orderBy = [];
    this._groupBy = [];
    this._having = [];
    this._limit = null;
    this._offset = null;
    this._includes = [];
    this._selectFields = ['*'];
    this._joins = [];
    this._distinct = false;
    this._forUpdate = false;
    this._lockInShareMode = false;
  }

  // ==================== CHAINABLE QUERY METHODS ====================

  /**
   * Add WHERE condition (AND)
   * 
   * Supports multiple formats:
   * - where({ field: value }) - Simple equality
   * - where({ field: { $gt: 10 } }) - Operators
   * - where('field', 'value') - Simple equality
   * - where('field', '>', 10) - Comparison
   * - where('field', [1, 2, 3]) - IN clause
   * - where({ $or: [{ field1: 1 }, { field2: 2 }] }) - OR conditions
   * 
   * @param {Object|string} conditions - Where conditions
   * @param {...*} args - Additional arguments for operators
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .where({ status: 'active' })
   * .where({ age: { $gte: 18 } })
   * .where('field', '>=', 10)
   * .where({ $or: [{ a: 1 }, { b: 2 }] })
   */
  where(conditions, ...args) {
    if (typeof conditions === 'string') {
      // where('field', 'value') or where('field', 'operator', 'value')
      const field = conditions;
      const operator = args.length === 1 ? '=' : args[0];
      const value = args.length === 1 ? args[0] : args[1];
      this._whereConditions.push(this._buildCondition(field, operator, value));
    } else if (typeof conditions === 'object' && conditions !== null) {
      if (conditions.$or) {
        // Handle $or conditions
        for (const condition of conditions.$or) {
          this._orConditions.push(this._buildWhereClause(condition));
        }
      } else {
        this._whereConditions.push(conditions);
      }
    }
    return this;
  }

  /**
   * Add OR WHERE condition
   * 
   * @param {Object} conditions - OR conditions
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .where({ status: 'active' })
   * .orWhere({ status: 'pending' })
   */
  orWhere(conditions) {
    if (typeof conditions === 'object' && conditions !== null) {
      if (conditions.$or) {
        for (const condition of conditions.$or) {
          this._orConditions.push(this._buildWhereClause(condition));
        }
      } else {
        this._orConditions.push(conditions);
      }
    }
    return this;
  }

  /**
   * Add WHERE condition with explicit operator
   * 
   * @param {string} field - Field name
   * @param {string} operator - Operator (=, >, <, >=, <=, !=, LIKE, IN, etc.)
   * @param {*} value - Value to compare
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereOp('age', '>=', 18)
   * .whereOp('name', 'LIKE', '%John%')
   */
  whereOp(field, operator, value) {
    this._whereConditions.push(this._buildCondition(field, operator, value));
    return this;
  }

  /**
   * Add WHERE IN condition
   * 
   * @param {string} field - Field name
   * @param {Array} values - Values for IN clause
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereIn('id', [1, 2, 3])
   */
  whereIn(field, values) {
    this._whereConditions.push({ [field]: { $in: values } });
    return this;
  }

  /**
   * Add WHERE NOT IN condition
   * 
   * @param {string} field - Field name
   * @param {Array} values - Values to exclude
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereNotIn('status', ['deleted', 'archived'])
   */
  whereNotIn(field, values) {
    this._whereConditions.push({ [field]: { $notIn: values } });
    return this;
  }

  /**
   * Add WHERE NULL condition
   * 
   * @param {string} field - Field name
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereNull('deleted_at')
   */
  whereNull(field) {
    this._whereConditions.push({ [field]: { $isNull: true } });
    return this;
  }

  /**
   * Add WHERE NOT NULL condition
   * 
   * @param {string} field - Field name
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereNotNull('confirmed_at')
   */
  whereNotNull(field) {
    this._whereConditions.push({ [field]: { $isNotNull: true } });
    return this;
  }

  /**
   * Add WHERE BETWEEN condition
   * 
   * @param {string} field - Field name
   * @param {Array} range - [min, max] range
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereBetween('age', [18, 65])
   */
  whereBetween(field, range) {
    this._whereConditions.push({ [field]: { $between: range } });
    return this;
  }

  /**
   * Add WHERE NOT BETWEEN condition
   * 
   * @param {string} field - Field name
   * @param {Array} range - [min, max] range
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereNotBetween('price', [100, 500])
   */
  whereNotBetween(field, range) {
    this._whereConditions.push({ [field]: { $notBetween: range } });
    return this;
  }

  /**
   * Add WHERE LIKE condition
   * 
   * @param {string} field - Field name
   * @param {string} pattern - LIKE pattern
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereLike('name', '%John%')
   */
  whereLike(field, pattern) {
    this._whereConditions.push({ [field]: { $like: pattern } });
    return this;
  }

  /**
   * Add WHERE NOT LIKE condition
   * 
   * @param {string} field - Field name
   * @param {string} pattern - Pattern to exclude
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .whereNotLike('name', '%Test%')
   */
  whereNotLike(field, pattern) {
    this._whereConditions.push({ [field]: { $notLike: pattern } });
    return this;
  }

  /**
   * Add search condition (LIKE %value%)
   * 
   * @param {string} field - Field name
   * @param {string} value - Search value
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .search('name', 'John') // LIKE '%John%'
   */
  search(field, value) {
    this._whereConditions.push({ [field]: { $contains: value } });
    return this;
  }

  /**
   * Order results by field
   * 
   * @param {string} field - Field to order by
   * @param {string} direction - 'ASC' or 'DESC'
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .order('created_at', 'DESC')
   * .order('-created_at') // Descending shorthand
   */
  order(field, direction = 'ASC') {
    if (field.startsWith('-')) {
      this._orderBy.push(`${field.substring(1)} DESC`);
    } else {
      this._orderBy.push(`${field} ${direction}`);
    }
    return this;
  }

  /**
   * Alias for order() - for Laravel compatibility
   * 
   * @param {string} field - Field to order by
   * @param {string} direction - 'ASC' or 'DESC'
   * @returns {QuerySet} - This QuerySet for chaining
   */
  orderBy(field, direction = 'ASC') {
    return this.order(field, direction);
  }

  /**
   * Order by multiple fields
   * 
   * @param {Array} fields - Array of field names
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .orderByMultiple(['name ASC', 'age DESC'])
   */
  orderByMultiple(fields) {
    this._orderBy.push(...fields.map(f => {
      if (f.includes(' ')) return f;
      return `${f} ASC`;
    }));
    return this;
  }

  /**
   * Alias for take() - for Laravel compatibility
   * 
   * @param {number} limit - Maximum number of records
   * @returns {QuerySet} - This QuerySet for chaining
   */
  limit(limit) {
    return this.take(limit);
  }

  /**
   * Set maximum number of records to return
   * 
   * @param {number} limit - Maximum number of records
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .take(10)
   */
  take(limit) {
    this._limit = limit;
    return this;
  }

  /**
   * Alias for skip() - for Laravel compatibility
   * 
   * @param {number} offset - Number of records to skip
   * @returns {QuerySet} - This QuerySet for chaining
   */
  offset(offset) {
    return this.skip(offset);
  }

  /**
   * Set number of records to skip
   * 
   * @param {number} offset - Number of records to skip
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .skip(20) // Skip first 20 records
   */
  skip(offset) {
    this._offset = offset;
    return this;
  }

  /**
   * Eager load related models
   * 
   * @param {string|Array} relations - Relation name(s) to include
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .include('posts')
   * .include(['posts', 'comments', 'author'])
   * .include({ posts: { include: 'comments' } })
   */
  include(relations) {
    if (Array.isArray(relations)) {
      this._includes.push(...relations);
    } else if (typeof relations === 'object') {
      this._includes.push(relations);
    } else {
      this._includes.push(relations);
    }
    return this;
  }

  /**
   * Alias for include() - for Laravel compatibility
   * 
   * @param {string|Array} relations - Relation name(s) to load
   * @returns {QuerySet} - This QuerySet for chaining
   */
  with(relations) {
    return this.include(relations);
  }

  /**
   * Select specific fields
   * 
   * @param {string|Array} fields - Field name(s) to select
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .select('id', 'name', 'email')
   * .select(['id', 'name'])
   */
  select(...fields) {
    this._selectFields = fields.length > 0 ? fields : ['*'];
    return this;
  }

  /**
   * Add distinct selection
   * 
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .distinct()
   * .distinct('status') // SELECT DISTINCT status
   */
  distinct(field = null) {
    this._distinct = true;
    if (field) {
      this._selectFields = [field];
    }
    return this;
  }

  /**
   * Add GROUP BY clause
   * 
   * @param {string|Array} fields - Field(s) to group by
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .groupBy('status')
   * .groupBy(['status', 'category'])
   */
  groupBy(fields) {
    const groupFields = Array.isArray(fields) ? fields : [fields];
    this._groupBy.push(...groupFields);
    return this;
  }

  /**
   * Add HAVING clause
   * 
   * @param {string} condition - HAVING condition
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .groupBy('status')
   * .having('COUNT(*) > 5')
   */
  having(condition) {
    this._having.push(condition);
    return this;
  }

  /**
   * Add FOR UPDATE lock
   * 
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .forUpdate()
   */
  forUpdate() {
    this._forUpdate = true;
    return this;
  }

  /**
   * Add LOCK IN SHARE MODE
   * 
   * @returns {QuerySet} - This QuerySet for chaining
   * 
   * @example
   * .lockInShareMode()
   */
  lockInShareMode() {
    this._lockInShareMode = true;
    return this;
  }

  // ==================== EXECUTION METHODS ====================

  /**
   * Execute query and return all matching records
   * 
   * @returns {Promise<Array<Model>>} - Array of model instances
   * 
   * @example
   * const users = await User.query().where({ active: true }).get();
   */
  async get() {
    const items = await this._execute();
    
    if (!this._includes || this._includes.length === 0) return items;
    await this._eagerLoad(items, this._includes);
    return items;
  }

  /**
   * Execute query and return first record
   * 
   * @returns {Promise<Model|null>} - First model instance or null
   * 
   * @example
   * const user = await User.query().where({ email }).first();
   */
  async first() {
    this.take(1);
    const results = await this.get();
    return results[0] || null;
  }

  /**
   * Execute query and return first record, or throw if not found
   * 
   * @param {string} message - Error message if not found
   * @returns {Promise<Model>} - First model instance
   * @throws {NotFoundError} - If no record found
   * 
   * @example
   * const user = await User.query().where({ id }).firstOrFail('User not found');
   */
  async firstOrFail(message = 'Record not found') {
    const result = await this.first();
    if (!result) {
      throw new NotFoundError(message, this.model.tableName);
    }
    return result;
  }

  /**
   * Count matching records
   * 
   * @param {string} field - Optional field to count (default: *)
   * @returns {Promise<number>} - Count of matching records
   * 
   * @example
   * const count = await User.query().where({ active: true }).count();
   */
  async count(field = '*') {
    const dbType = this.model.orm?.config?.type;
    
    if (dbType === 'mongodb') {
      const db = this.model.orm.adapter.client.db(this.model.orm.config.database);
      const col = db.collection(this.model.tableName);
      const mongoWhere = this._buildMongoWhere();
      return col.countDocuments(mongoWhere);
    }

    const whereClause = this._buildWhereClause();
    const selectField = this._distinct ? 'DISTINCT ' + field : field;
    let sql = `SELECT COUNT(${selectField}) as count FROM ${this.model.tableName}`;
    
    if (whereClause.sql) sql += ` WHERE ${whereClause.sql}`;
    if (this._groupBy.length > 0) {
      sql = `SELECT COUNT(*) as count FROM (SELECT ${this._selectFields.join(', ')} FROM ${this.model.tableName}`;
      if (whereClause.sql) sql += ` WHERE ${whereClause.sql}`;
      sql += ` GROUP BY ${this._groupBy.join(', ')}`;
      if (this._having.length > 0) {
        sql += ` HAVING ${this._having.join(' AND ')}`;
      }
      sql += ') as subquery';
    }

    const { rows } = await this.model.orm.adapter.execute(sql, whereClause.values);
    const count = rows[0] ? (rows[0].count ?? Object.values(rows[0])[0]) : 0;
    return parseInt(count, 10);
  }

  /**
   * Check if any records exist
   * 
   * @returns {Promise<boolean>} - True if records exist
   * 
   * @example
   * const exists = await User.query().where({ email }).exists();
   */
  async exists() {
    this._selectFields = ['1'];
    this._limit = 1;
    const whereClause = this._buildWhereClause();
    let sql = `SELECT 1 FROM ${this.model.tableName}`;
    if (whereClause.sql) sql += ` WHERE ${whereClause.sql}`;
    sql += ' LIMIT 1';

    const { rows } = await this.model.orm.adapter.execute(sql, whereClause.values);
    return rows.length > 0;
  }

  /**
   * Aggregate calculations
   * 
   * @param {string} operation - Operation: sum, avg, min, max, count
   * @param {string} field - Field to aggregate
   * @returns {Promise<number>} - Aggregated value
   * 
   * @example
   * const total = await Order.query().sum('amount');
   * const avgAge = await User.query().avg('age');
   */
  async aggregate(operation, field) {
    const validOps = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];
    const op = operation.toUpperCase();
    if (!validOps.includes(op)) {
      throw new UltraORMError(`Invalid aggregate operation: ${operation}`);
    }

    const whereClause = this._buildWhereClause();
    let sql = `SELECT ${op}(${field}) as result FROM ${this.model.tableName}`;
    if (whereClause.sql) sql += ` WHERE ${whereClause.sql}`;

    const { rows } = await this.model.orm.adapter.execute(sql, whereClause.values);
    return rows[0]?.result ? parseFloat(rows[0].result) : 0;
  }

  /**
   * Shorthand aggregate methods
   */
  async sum(field) { return this.aggregate('sum', field); }
  async avg(field) { return this.aggregate('avg', field); }
  async min(field) { return this.aggregate('min', field); }
  async max(field) { return this.aggregate('max', field); }

  /**
   * Paginate results
   * 
   * @param {number} page - Page number (1-based)
   * @param {number} perPage - Records per page
   * @returns {Promise<Object>} - { items, pagination }
   * 
   * @example
   * const { items, pagination } = await User.query().paginate(2, 20);
   */
  async paginate(page = 1, perPage = 20) {
    page = Math.max(1, parseInt(page, 10));
    perPage = Math.max(1, parseInt(perPage, 10));
    const offset = (page - 1) * perPage;
    
    this.skip(offset).take(perPage);

    const [items, total] = await Promise.all([
      this.get(),
      this.count()
    ]);

    return {
      items,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
        hasNext: page < Math.ceil(total / perPage),
        hasPrev: page > 1,
        firstPage: 1,
        lastPage: Math.ceil(total / perPage)
      }
    };
  }

  /**
   * Get only values (plain objects, not model instances)
   * 
   * @param {Array} fields - Fields to select
   * @returns {Promise<Array<Object>>} - Array of plain objects
   * 
   * @example
   * const data = await User.query().values('id', 'name', 'email');
   */
  async values(...fields) {
    this._selectFields = fields.length > 0 ? fields : ['*'];
    const items = await this._execute();
    return items.map(item => item.toJSON ? item.toJSON() : item);
  }

  /**
   * Get only one value
   * 
   * @param {string} field - Field name
   * @returns {Promise<*>} - Field value
   * 
   * @example
   * const email = await User.query().where({ id }).value('email');
   */
  async value(field) {
    this._selectFields = [field];
    this._limit = 1;
    const items = await this._execute();
    if (items.length === 0) return null;
    const first = items[0].toJSON ? items[0].toJSON() : items[0];
    return first[field];
  }

  /**
   * Bulk update records matching conditions
   * 
   * @param {Object} data - Data to update
   * @returns {Promise<number>} - Number of affected rows
   * 
   * @example
   * await User.query().where({ status: 'inactive' }).update({ status: 'archived' });
   */
  async update(data) {
    const whereClause = this._buildWhereClause();
    if (Object.keys(data).length === 0) return 0;

    const updates = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      updates.push(`${key} = ?`);
      values.push(value);
    }
    values.push(...whereClause.values);

    let sql = `UPDATE ${this.model.tableName} SET ${updates.join(', ')}`;
    if (whereClause.sql) sql += ` WHERE ${whereClause.sql}`;

    const { result } = await this.model.orm.adapter.execute(sql, values);
    return result?.affectedRows || 0;
  }

  /**
   * Increment a numeric field
   * 
   * @param {string} field - Field to increment
   * @param {number} amount - Amount to increment by (default: 1)
   * @returns {Promise<number>} - Number of affected rows
   * 
   * @example
   * await Post.query().where({ id }).increment('view_count');
   */
  async increment(field, amount = 1) {
    return this.update({ [field]: this.model.orm.raw(`${field} + ${amount}`) });
  }

  /**
   * Decrement a numeric field
   * 
   * @param {string} field - Field to decrement
   * @param {number} amount - Amount to decrement by (default: 1)
   * @returns {Promise<number>} - Number of affected rows
   * 
   * @example
   * await Post.query().where({ id }).decrement('stock');
   */
  async decrement(field, amount = 1) {
    return this.update({ [field]: this.model.orm.raw(`${field} - ${amount}`) });
  }

  /**
   * Bulk delete records matching conditions
   * 
   * @returns {Promise<number>} - Number of deleted rows
   * 
   * @example
   * await User.query().where({ status: 'deleted' }).delete();
   */
  async delete() {
    const whereClause = this._buildWhereClause();
    let sql = `DELETE FROM ${this.model.tableName}`;
    if (whereClause.sql) sql += ` WHERE ${whereClause.sql}`;

    const { result } = await this.model.orm.adapter.execute(sql, whereClause.values);
    return result?.affectedRows || 0;
  }

  /**
   * Alias for delete
   */
  async destroy() { return this.delete(); }

  // ==================== PRIVATE METHODS ====================

  /**
   * Build WHERE clause from conditions
   */
  _buildWhereClause() {
    const conditions = [];
    const values = [];

    for (const cond of this._whereConditions) {
      const result = this._parseCondition(cond);
      if (result.clause) {
        conditions.push(result.clause);
        if (result.value !== undefined && result.value !== null) {
          if (Array.isArray(result.value)) {
            values.push(...result.value);
          } else {
            values.push(result.value);
          }
        }
      }
    }

    // Handle OR conditions
    if (this._orConditions.length > 0) {
      const orParts = [];
      for (const orCond of this._orConditions) {
        const result = this._buildSimpleWhere(orCond);
        if (result.clause) {
          orParts.push(result.clause);
          values.push(...result.values);
        }
      }
      if (orParts.length > 0) {
        if (conditions.length > 0) {
          conditions.push(`(${orParts.join(' OR ')})`);
        } else {
          conditions.push(`(${orParts.join(' OR ')})`);
        }
      }
    }

    return {
      sql: conditions.join(' AND '),
      values
    };
  }

  /**
   * Parse a single condition (handles operators)
   */
  _parseCondition(condition) {
    if (!condition || typeof condition !== 'object') {
      return { clause: '', value: undefined };
    }

    const clauses = [];
    const values = [];

    for (const [key, value] of Object.entries(condition)) {
      if (key.startsWith('$')) continue; // Skip $or handled elsewhere
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Handle operators
        for (const [op, opValue] of Object.entries(value)) {
          const handler = QUERY_OPERATORS[op];
          if (handler) {
            const result = handler(key, opValue);
            clauses.push(result.clause);
            if (result.value !== undefined && result.value !== null) {
              if (Array.isArray(result.value)) {
                values.push(...result.value);
              } else {
                values.push(result.value);
              }
            }
          }
        }
      } else {
        // Simple equality or IN
        if (Array.isArray(value)) {
          const placeholders = value.map(() => '?').join(', ');
          clauses.push(`${key} IN (${placeholders})`);
          values.push(...value);
        } else {
          clauses.push(`${key} = ?`);
          values.push(value);
        }
      }
    }

    return {
      clause: clauses.join(' AND '),
      value: values.length === 1 ? values[0] : values
    };
  }

  /**
   * Build simple where from plain object
   */
  _buildSimpleWhere(where) {
    const conditions = [];
    const values = [];

    for (const [key, value] of Object.entries(where)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [op, opValue] of Object.entries(value)) {
          const handler = QUERY_OPERATORS[op];
          if (handler) {
            const result = handler(key, opValue);
            conditions.push(result.clause);
            if (result.value !== null) {
              if (Array.isArray(result.value)) {
                values.push(...result.value);
              } else {
                values.push(result.value);
              }
            }
          }
        }
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        values.push(...value);
      } else {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
    }

    return {
      clause: conditions.join(' AND '),
      values
    };
  }

  /**
   * Build MongoDB-style where clause
   */
  _buildMongoWhere() {
    const where = {};
    for (const cond of this._whereConditions) {
      for (const [key, value] of Object.entries(cond)) {
        if (key === '$or') continue;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const mongoOp = {};
          for (const [op, opValue] of Object.entries(value)) {
            const mongoOps = {
              '$eq': '$eq',
              '$ne': '$ne',
              '$gt': '$gt',
              '$gte': '$gte',
              '$lt': '$lt',
              '$lte': '$lte',
              '$in': '$in',
              '$notIn': '$nin',
              '$like': undefined,
              '$contains': undefined
            };
            if (mongoOps[op]) {
              mongoOp[mongoOps[op]] = opValue;
            } else if (op === '$contains') {
              mongoOp.$regex = opValue.replace(/%/g, '.*');
              mongoOp.$options = 'i';
            } else if (op === '$like') {
              mongoOp.$regex = '^' + opValue.replace(/%/g, '.*');
            }
          }
          if (Object.keys(mongoOp).length > 0) {
            where[key] = mongoOp;
          }
        } else {
          where[key] = value;
        }
      }
    }
    return where;
  }

  /**
   * Build condition with operator
   */
  _buildCondition(field, operator, value) {
    const op = operator.toUpperCase();
    
    if (op === 'IN' && Array.isArray(value)) {
      return { [field]: { $in: value } };
    }
    if (op === 'NOT IN' && Array.isArray(value)) {
      return { [field]: { $notIn: value } };
    }
    if (op === 'IS NULL') {
      return { [field]: { $isNull: true } };
    }
    if (op === 'IS NOT NULL') {
      return { [field]: { $isNotNull: true } };
    }
    if (op === 'LIKE') {
      return { [field]: { $like: value } };
    }
    if (op === 'NOT LIKE') {
      return { [field]: { $notLike: value } };
    }
    if (op === '=' || op === '==') {
      return { [field]: value };
    }
    
    const opMap = {
      '>': '$gt',
      '>=': '$gte',
      '<': '$lt',
      '<=': '$lte',
      '!=': '$ne',
      '<>': '$ne'
    };
    
    const queryOp = opMap[op] || op.toLowerCase();
    return { [field]: { [queryOp]: value } };
  }

  /**
   * Execute the query
   */
  async _execute() {
    const dbType = this.model.orm?.config?.type;
    
    if (dbType === 'mongodb') {
      return this._executeMongo();
    }

    return this._executeSQL();
  }

  /**
   * Execute SQL query
   */
  async _executeSQL() {
    const adapterType = this.model.orm.config.type;
    const whereClause = this._buildWhereClause();
    
    let sql = `SELECT ${this._distinct ? 'DISTINCT ' : ''}${this._selectFields.join(', ')} FROM ${this.model.tableName}`;
    
    if (whereClause.sql) sql += ` WHERE ${whereClause.sql}`;
    if (this._groupBy.length > 0) sql += ` GROUP BY ${this._groupBy.join(', ')}`;
    if (this._having.length > 0) sql += ` HAVING ${this._having.join(' AND ')}`;
    if (this._orderBy.length > 0) sql += ` ORDER BY ${this._orderBy.join(', ')}`;
    if (this._limit !== null) sql += ` LIMIT ${this._limit}`;
    if (this._offset !== null) sql += ` OFFSET ${this._offset}`;
    if (this._forUpdate) sql += ' FOR UPDATE';
    if (this._lockInShareMode) sql += ' LOCK IN SHARE MODE';

    const { rows } = await this.model.orm.adapter.execute(sql, whereClause.values);
    return rows.map(row => {
      const instance = new this.model(row);
      instance.isNew = false;
      return instance;
    });
  }

  /**
   * Execute MongoDB query
   */
  async _executeMongo() {
    const db = this.model.orm.adapter.client.db(this.model.orm.config.database);
    const col = db.collection(this.model.tableName);
    const mongoWhere = this._buildMongoWhere();
    
    const findOptions = {};
    if (this._selectFields[0] !== '*') {
      findOptions.projection = {};
      for (const field of this._selectFields) {
        findOptions.projection[field] = 1;
      }
    }
    
    let cursor = col.find(mongoWhere, findOptions);
    
    if (this._orderBy.length > 0) {
      const sort = {};
      for (const order of this._orderBy) {
        const parts = order.split(' ');
        sort[parts[0]] = parts[1]?.toUpperCase() === 'DESC' ? -1 : 1;
      }
      cursor = cursor.sort(sort);
    }
    
    if (this._limit) cursor = cursor.limit(this._limit);
    if (this._offset) cursor = cursor.skip(this._offset);
    
    const docs = await cursor.toArray();
    return docs.map(d => {
      const inst = new this.model(d);
      inst.isNew = false;
      return inst;
    });
  }

  /**
   * Eager load related models
   */
  async _eagerLoad(instances, includes) {
    if (!instances || instances.length === 0) return;

    const ModelClass = this.model;
    const associations = ModelClass.associations || {};
    const dbType = ModelClass.orm.config.type;

    for (const includeItem of includes) {
      let includeName = includeItem;
      let nestedOptions = null;
      
      if (typeof includeItem === 'object') {
        includeName = Object.keys(includeItem)[0];
        nestedOptions = includeItem[includeName];
      }

      const assoc = associations[includeName];
      if (!assoc) {
        throw new UltraORMError(`Association "${includeName}" not found on model ${ModelClass.tableName}`);
      }

      // Handle MongoDB embedded documents
      if (dbType === 'mongodb' && (assoc.type === 'embedsOne' || assoc.type === 'embedsMany')) {
        for (const inst of instances) {
          const data = inst.get(includeName);
          if (data) {
            inst[includeName] = assoc.type === 'embedsOne' ? new assoc.target(data) : data.map(d => new assoc.target(d));
          } else {
            inst[includeName] = assoc.type === 'embedsOne' ? null : [];
          }
        }
        continue;
      }

      if (assoc.type === 'belongsTo') {
        await this._loadBelongsTo(instances, assoc, includeName);
      } else if (assoc.type === 'hasMany') {
        await this._loadHasMany(instances, assoc, includeName);
      } else if (assoc.type === 'hasOne') {
        await this._loadHasOne(instances, assoc, includeName);
      } else if (assoc.type === 'belongsToMany' || assoc.type === 'hasManyThrough') {
        await this._loadBelongsToMany(instances, assoc, includeName);
      } else if (assoc.type === 'morphMany' || assoc.type === 'morphOne') {
        await this._loadPolymorphic(instances, assoc, includeName);
      } else if (assoc.type === 'morphTo') {
        await this._loadMorphTo(instances, assoc, includeName);
      }
    }
  }

  /**
   * Load belongsTo relation
   */
  async _loadBelongsTo(instances, assoc, includeName) {
    const fk = assoc.foreignKey;
    const target = assoc.target;
    const sourceKey = assoc.sourceKey || 'id';
    
    const fkValues = [...new Set(instances.map(i => i.get(fk)).filter(v => v !== null && v !== undefined))];
    if (fkValues.length === 0) {
      for (const inst of instances) inst[includeName] = null;
      return;
    }

    const where = {};
    where[sourceKey] = fkValues.length === 1 ? fkValues[0] : fkValues;
    
    const related = await target.find(where);
    const map = new Map();
    for (const r of related) {
      map.set(String(r.get(sourceKey)), r);
    }
    
    for (const inst of instances) {
      const v = inst.get(fk);
      inst[includeName] = v != null ? map.get(String(v)) || null : null;
    }
  }

  /**
   * Load hasMany relation
   */
  async _loadHasMany(instances, assoc, includeName) {
    const fk = assoc.foreignKey;
    const target = assoc.target;
    const sourceKey = assoc.sourceKey || 'id';
    
    const sourceIds = [...new Set(instances.map(i => i.get(sourceKey)).filter(v => v !== null && v !== undefined))];
    if (sourceIds.length === 0) {
      for (const inst of instances) inst[includeName] = [];
      return;
    }

    const where = {};
    where[fk] = sourceIds.length === 1 ? sourceIds[0] : sourceIds;
    
    const related = await target.find(where);
    const groups = {};
    for (const r of related) {
      const key = String(r.get(fk));
      groups[key] = groups[key] || [];
      groups[key].push(r);
    }
    
    for (const inst of instances) {
      const id = inst.get(sourceKey);
      inst[includeName] = groups[String(id)] || [];
    }
  }

  /**
   * Load hasOne relation
   */
  async _loadHasOne(instances, assoc, includeName) {
    const fk = assoc.foreignKey;
    const target = assoc.target;
    const sourceKey = assoc.sourceKey || 'id';
    
    const sourceIds = [...new Set(instances.map(i => i.get(sourceKey)).filter(v => v !== null && v !== undefined))];
    if (sourceIds.length === 0) {
      for (const inst of instances) inst[includeName] = null;
      return;
    }

    const where = {};
    where[fk] = sourceIds.length === 1 ? sourceIds[0] : sourceIds;
    
    const related = await target.find(where);
    const map = new Map();
    for (const r of related) {
      map.set(String(r.get(fk)), r);
    }
    
    for (const inst of instances) {
      const id = inst.get(sourceKey);
      inst[includeName] = map.get(String(id)) || null;
    }
  }

  /**
   * Load belongsToMany relation
   */
  async _loadBelongsToMany(instances, assoc, includeName) {
    const target = assoc.target;
    const through = assoc.through;
    const foreignKey = assoc.foreignKey;
    const otherKey = assoc.otherKey;
    const sourceKey = assoc.sourceKey || 'id';
    
    const sourceIds = [...new Set(instances.map(i => i.get(sourceKey)).filter(v => v !== null && v !== undefined))];
    if (sourceIds.length === 0) {
      for (const inst of instances) inst[includeName] = [];
      return;
    }

    let junctionRecords;
    if (typeof through === 'string') {
      const placeholders = sourceIds.map(() => '?').join(',');
      const { rows } = await this.model.orm.adapter.execute(
        `SELECT * FROM ${through} WHERE ${foreignKey} IN (${placeholders})`,
        sourceIds
      );
      junctionRecords = rows;
    } else {
      const where = {};
      where[foreignKey] = sourceIds.length === 1 ? sourceIds[0] : sourceIds;
      junctionRecords = await through.find(where);
    }

    if (junctionRecords.length === 0) {
      for (const inst of instances) inst[includeName] = [];
      return;
    }

    const targetIds = [...new Set(junctionRecords.map(r => r[otherKey]))];
    const targetWhere = { id: targetIds.length === 1 ? targetIds[0] : targetIds };
    const targetRecords = await target.find(targetWhere);
    
    const targetMap = new Map();
    for (const tr of targetRecords) {
      targetMap.set(String(tr.get('id')), tr);
    }

    const groups = {};
    for (const jr of junctionRecords) {
      const sourceId = String(jr[foreignKey]);
      const targetId = String(jr[otherKey]);
      if (!groups[sourceId]) groups[sourceId] = [];
      if (targetMap.has(targetId)) {
        groups[sourceId].push(targetMap.get(targetId));
      }
    }

    for (const inst of instances) {
      const id = String(inst.get(sourceKey));
      inst[includeName] = groups[id] || [];
    }
  }

  /**
   * Load polymorphic relation
   */
  async _loadPolymorphic(instances, assoc, includeName) {
    const target = assoc.target;
    const morphType = assoc.morphType;
    const morphId = assoc.morphId;
    const modelType = this.model.tableName;
    
    const sourceIds = [...new Set(instances.map(i => i.get('id')).filter(v => v !== null))];
    if (sourceIds.length === 0) {
      for (const inst of instances) {
        inst[includeName] = assoc.type === 'morphMany' ? [] : null;
      }
      return;
    }

    const where = {};
    where[morphType] = modelType;
    where[morphId] = sourceIds.length === 1 ? sourceIds[0] : sourceIds;
    
    const related = await target.find(where);

    if (assoc.type === 'morphMany') {
      const groups = {};
      for (const r of related) {
        const key = String(r.get(morphId));
        groups[key] = groups[key] || [];
        groups[key].push(r);
      }
      for (const inst of instances) {
        inst[includeName] = groups[String(inst.get('id'))] || [];
      }
    } else {
      const map = new Map();
      for (const r of related) {
        map.set(String(r.get(morphId)), r);
      }
      for (const inst of instances) {
        inst[includeName] = map.get(String(inst.get('id'))) || null;
      }
    }
  }

  /**
   * Load morphTo relation
   */
  async _loadMorphTo(instances, assoc, includeName) {
    const morphType = assoc.morphType;
    const morphId = assoc.morphId;
    
    const groupsByType = {};
    for (const inst of instances) {
      const type = inst.get(morphType);
      const id = inst.get(morphId);
      if (type && id) {
        if (!groupsByType[type]) groupsByType[type] = [];
        groupsByType[type].push({ inst, id });
      } else {
        inst[includeName] = null;
      }
    }

    for (const [type, items] of Object.entries(groupsByType)) {
      const TargetModel = this.model.orm.model(type);
      if (!TargetModel) continue;

      const ids = items.map(i => i.id);
      const where = { id: ids.length === 1 ? ids[0] : ids };
      const related = await TargetModel.find(where);

      const map = new Map();
      for (const r of related) {
        map.set(String(r.get('id')), r);
      }

      for (const item of items) {
        item.inst[includeName] = map.get(String(item.id)) || null;
      }
    }
  }

  /**
   * Create QuerySet from model
   */
  static from(model) {
    return new QuerySet(model);
  }
}

// ==================== DBADAPTER CLASS ====================
/**
 * DBAdapter - Database adapter for PostgreSQL, MySQL, and MongoDB
 * 
 * Handles all database-specific operations:
 * - Connection pooling
 * - Query execution
 * - Transaction management
 * - SQL translation
 * 
 * @example
 * const adapter = new DBAdapter({
 *   type: 'postgres',
 *   host: 'localhost',
 *   database: 'mydb'
 * });
 * await adapter.connect();
 */
class DBAdapter {
  /**
   * Create a new DBAdapter
   * @param {Object} config - Database configuration
   */
  constructor(config) {
    this.config = config;
    this.type = config.type;
    this.pool = null;
    this.client = null;
    this._transactionClient = null;
  }

  /**
   * Connect to the database
   * @returns {Promise<DBAdapter>} - This adapter instance
   */
  async connect() {
    if (this.pool || this.client) return this;

    try {
      switch (this.type) {
        case 'postgres':
          this.pool = new Pool({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            port: this.config.port || 5432,
            max: this.config.poolSize || 20,
            idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: this.config.connectionTimeoutMillis || 5000,
          });
          // Test connection
          await this.pool.query('SELECT 1');
          break;

        case 'mysql':
          this.pool = await mysql.createPool({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            port: this.config.port || 3306,
            connectionLimit: this.config.poolSize || 10,
            acquireTimeout: this.config.acquireTimeout || 60000,
            waitForConnections: true,
            queueLimit: 0,
          });
          // Test connection
          await this.pool.query('SELECT 1');
          break;

        case 'mongodb':
          const mongoConfig = {
            maxPoolSize: this.config.poolSize || 10,
            serverSelectionTimeoutMS: this.config.timeout || 5000,
            socketTimeoutMS: this.config.socketTimeout || 45000,
          };
          this.client = new MongoClient(this.config.url || this._buildMongoUrl(), mongoConfig);
          await this.client.connect();
          break;

        default:
          throw new DatabaseError(`Unsupported database type: ${this.type}`);
      }
      
      console.log(`[UltraORM] Connected to ${this.type} database successfully`);
      return this;
    } catch (error) {
      throw new DatabaseError(`Failed to connect to database: ${error.message}`, error);
    }
  }

  /**
   * Build MongoDB connection URL
   */
  _buildMongoUrl() {
    const { host, port, user, password, database } = this.config;
    if (user && password) {
      return `mongodb://${user}:${password}@${host}:${port || 27017}/${database}`;
    }
    return `mongodb://${host}:${port || 27017}/${database}`;
  }

  /**
   * Disconnect from the database
   */
  async disconnect() {
    try {
      if (this.type === 'postgres' && this.pool) {
        await this.pool.end();
        this.pool = null;
      } else if (this.type === 'mysql' && this.pool) {
        await this.pool.end();
        this.pool = null;
      } else if (this.type === 'mongodb' && this.client) {
        await this.client.close();
        this.client = null;
      }
      console.log('[UltraORM] Disconnected from database');
    } catch (error) {
      console.error('[UltraORM] Error disconnecting:', error.message);
    }
  }

  /**
   * Execute a raw SQL query
   * 
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} - { rows, result }
   */
  async execute(sql, params = []) {
    if (this.type === 'mongodb') {
      throw new UltraORMError('Use collection-based methods for MongoDB');
    }

    const { sql: finalSql, params: finalParams } = this._convertPlaceholders(sql, params);
    
    try {
      if (this.type === 'postgres') {
        const res = await this.pool.query(finalSql, finalParams);
        return { rows: res.rows || [], result: res };
      } else if (this.type === 'mysql') {
        const [rows, result] = await this.pool.execute(finalSql, finalParams);
        return { rows: rows || [], result };
      }
    } catch (error) {
      throw new DatabaseError(`Query failed: ${error.message}\nSQL: ${sql}`, error);
    }

    throw new UltraORMError('Unsupported database type');
  }

  /**
   * Convert ? placeholders to $1, $2, etc. for PostgreSQL
   */
  _convertPlaceholders(sql, params) {
    if (this.type !== 'postgres') return { sql, params };
    
    let idx = 1;
    const newSql = sql.replace(/\?/g, () => `$${idx++}`);
    return { sql: newSql, params };
  }

  /**
   * Insert a record and return the inserted ID
   * 
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   * @param {string} primaryKey - Primary key column name
   * @returns {Promise<Object>} - { id, result }
   */
  async insertReturning(table, data, primaryKey = 'id') {
    const cols = Object.keys(data);
    const vals = Object.values(data);

    if (this.type === 'postgres') {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) RETURNING ${primaryKey}`;
      const res = await this.pool.query(sql, vals);
      return { [primaryKey]: res.rows[0]?.[primaryKey], result: res };
    } else if (this.type === 'mysql') {
      const placeholders = cols.map(() => '?').join(', ');
      const [result] = await this.pool.execute(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`,
        vals
      );
      return { [primaryKey]: result.insertId, result };
    }
    
    throw new UltraORMError('insertReturning not supported for this DB');
  }

  /**
   * Execute a transaction
    * 
    * @param {Function} callback - Callback function receiving transaction client
    * @param {Object} options - Transaction options
    * @param {number} options.maxRetries - Maximum retry attempts on deadlock (default: 3)
    * @param {number} options.retryDelay - Delay between retries in ms (default: 100)
    * @param {string} options.isolationLevel - Transaction isolation level
    * @param {number} options.lockTimeout - Lock timeout in seconds (PostgreSQL)
    * @param {number} options.statementTimeout - Statement timeout in ms
    * 
    * @example
    * // Basic transaction
    * const result = await adapter.transaction(async (client) => {
    *   await client.execute('INSERT INTO users...');
    *   await client.execute('INSERT INTO posts...');
    *   return user;
    * });
    * 
    * // Transaction with deadlock retry
    * const result = await adapter.transaction(async (client) => {
    *   // Your operations
    * }, { maxRetries: 5, lockTimeout: 10 });
    */
  async transaction(callback, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 100;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.type === 'mongodb') {
          return await this._transactionMongoDB(callback, options);
        } else if (this.type === 'postgres') {
          return await this._transactionPostgres(callback, options);
        } else if (this.type === 'mysql') {
          return await this._transactionMySQL(callback, options);
        }
      } catch (error) {
        lastError = error;

        // Check if it's a deadlock error
        const isDeadlock = this._isDeadlockError(error);

        if (isDeadlock && attempt < maxRetries) {
          console.warn(`[UltraORM] Deadlock detected, retrying (${attempt}/${maxRetries})...`);
          await this._sleep(retryDelay * attempt); // Exponential backoff
          continue;
        }

        // Check for lock wait timeout
        const isLockTimeout = this._isLockTimeoutError(error);
        if (isLockTimeout && attempt < maxRetries) {
          console.warn(`[UltraORM] Lock timeout, retrying (${attempt}/${maxRetries})...`);
          await this._sleep(retryDelay * attempt);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Check if error is a deadlock error
   */
  _isDeadlockError(error) {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();
    return message.includes('deadlock') ||
           message.includes('dead lock') ||
           error.code === '40P01' || // PostgreSQL deadlock
           error.errno === 1213;     // MySQL deadlock
  }

  /**
   * Check if error is a lock timeout error
   */
  _isLockTimeoutError(error) {
    if (!error) return false;
    const message = (error.message || '').toLowerCase();
    return message.includes('lock wait timeout') ||
           message.includes('lock timeout') ||
           error.code === '55P03' || // PostgreSQL lock_not_available
           error.errno === 1205;     // MySQL lock wait timeout
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * MongoDB transaction with retry support
   */
  async _transactionMongoDB(callback, options) {
    const session = this.client.startSession();
    try {
      const transactionOptions = {
        readConcern: { level: options.readConcern || 'snapshot' },
        writeConcern: { w: options.writeConcern || 'majority' }
      };

      let result;
      await session.withTransaction(async () => {
        result = await callback({
          session,
          db: this.client.db(this.config.database),
          execute: async (collection, operation, data, opts = {}) => {
            const col = this.client.db(this.config.database).collection(collection);
            return col[operation](data, { session, ...opts });
          }
        });
      }, transactionOptions);
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * PostgreSQL transaction with timeouts and advisory locks
   */
  async _transactionPostgres(callback, options) {
    const client = await this.pool.connect();
    try {
      // Set lock timeout (default: 5 seconds)
      const lockTimeout = options.lockTimeout || 5;
      await client.query(`SET lock_timeout = '${lockTimeout}s'`);

      // Set statement timeout (default: 30 seconds)
      const statementTimeout = options.statementTimeout || 30000;
      await client.query(`SET statement_timeout = '${statementTimeout}ms'`);

      // Set isolation level
      const isolationLevel = options.isolationLevel || 'READ COMMITTED';
      await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

      const result = await callback({
        query: (sql, params) => {
          const { sql: finalSql, params: finalParams } = this._convertPlaceholders(sql, params);
          return client.query(finalSql, finalParams);
        },
        execute: (sql, params) => {
          const { sql: finalSql, params: finalParams } = this._convertPlaceholders(sql, params);
          return client.query(finalSql, finalParams);
        },
        client,
        // Helper methods
        select: (sql, params) => {
          const { sql: finalSql, params: finalParams } = this._convertPlaceholders(sql, params);
          return client.query(finalSql, finalParams).then(r => r.rows);
        },
        insert: (sql, params) => {
          const { sql: finalSql, params: finalParams } = this._convertPlaceholders(sql, params);
          return client.query(finalSql, finalParams).then(r => r.rows[0]);
        },
        // Advisory lock methods for distributed locking
        advisoryLock: async (lockId) => {
          await client.query(`SELECT pg_advisory_lock(${lockId})`);
        },
        advisoryUnlock: async (lockId) => {
          await client.query(`SELECT pg_advisory_unlock(${lockId})`);
        },
        tryAdvisoryLock: async (lockId) => {
          const { rows } = await client.query(`SELECT pg_try_advisory_lock(${lockId})`);
          return rows[0]?.pg_try_advisory_lock || false;
        }
      });

      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * MySQL transaction with timeouts
   */
  async _transactionMySQL(callback, options) {
    const conn = await this.pool.getConnection();
    try {
      // Set lock wait timeout (default: 5 seconds)
      const lockTimeout = options.lockTimeout || 5;
      await conn.query(`SET lock_wait_timeout = ${lockTimeout}`);

      // Set session timeout
      const statementTimeout = options.statementTimeout || 30000;
      await conn.query(`SET wait_timeout = ${Math.floor(statementTimeout / 1000)}`);

      // Set isolation level
      const isolationLevel = options.isolationLevel || 'READ COMMITTED';
      await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);

      await conn.beginTransaction();
      const result = await callback({
        query: (sql, params) => conn.query(sql, params),
        execute: (sql, params) => conn.query(sql, params),
        connection: conn,
        // Helper methods
        select: (sql, params) => conn.query(sql, params).then(([rows]) => rows),
        insert: (sql, params) => conn.query(sql, params).then(([result]) => result),
        getConnection: () => conn
      });
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Execute with PostgreSQL client
   */
  async _executeWithClient(client, sql, params) {
    const { sql: finalSql, params: finalParams } = this._convertPlaceholders(sql, params);
    return client.query(finalSql, finalParams);
  }

  /**
   * Execute with MySQL connection
   */
  async _executeWithConnection(conn, sql, params) {
    const [rows, result] = await conn.execute(sql, params);
    return { rows, result };
  }

  /**
   * Check if a table exists
   * 
   * @param {string} tableName - Table name
   * @returns {Promise<boolean>} - True if exists
   */
  async tableExists(tableName) {
    if (this.type === 'mongodb') {
      const db = this.client.db(this.config.database);
      const collections = await db.listCollections({ name: tableName }).toArray();
      return collections.length > 0;
    }

    if (this.type === 'postgres') {
      const { rows } = await this.execute(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [tableName]
      );
      return rows[0]?.exists || false;
    }

    if (this.type === 'mysql') {
      const { rows } = await this.execute(
        `SHOW TABLES LIKE ?`,
        [tableName]
      );
      return rows.length > 0;
    }

    return false;
  }

  /**
   * Get all tables in database
   * 
   * @returns {Promise<Array<string>>} - List of table names
   */
  async getTables() {
    if (this.type === 'mongodb') {
      const db = this.client.db(this.config.database);
      const collections = await db.listCollections().toArray();
      return collections.map(c => c.name);
    }

    if (this.type === 'postgres') {
      const { rows } = await this.execute(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      );
      return rows.map(r => r.table_name);
    }

    if (this.type === 'mysql') {
      const { rows } = await this.execute('SHOW TABLES');
      return rows.map(r => Object.values(r)[0]);
    }

    return [];
  }

  /**
   * Describe table structure
   * 
   * @param {string} tableName - Table name
   * @returns {Promise<Array>} - Column definitions
   */
  async describe(tableName) {
    if (this.type === 'postgres') {
      const { rows } = await this.execute(
        `SELECT column_name, data_type, is_nullable, column_default 
         FROM information_schema.columns 
         WHERE table_name = $1 
         ORDER BY ordinal_position`,
        [tableName]
      );
      return rows;
    }

    if (this.type === 'mysql') {
      const { rows } = await this.execute(`DESCRIBE ${tableName}`);
      return rows;
    }

    return [];
  }

  /**
   * Truncate a table
   * 
   * @param {string} tableName - Table name
   * @param {boolean} cascade - Use CASCADE (PostgreSQL)
   */
  async truncate(tableName, cascade = false) {
    if (this.type === 'mongodb') {
      const db = this.client.db(this.config.database);
      await db.collection(tableName).deleteMany({});
      return;
    }

    if (this.type === 'postgres') {
      await this.execute(`TRUNCATE TABLE ${tableName}${cascade ? ' CASCADE' : ''} RESTART IDENTITY`);
    } else if (this.type === 'mysql') {
      await this.execute(`TRUNCATE TABLE ${tableName}`);
    }
  }

  /**
   * Drop a table
   * 
   * @param {string} tableName - Table name
   * @param {boolean} cascade - Use CASCADE
   */
  async dropTable(tableName, cascade = false) {
    if (this.type === 'mongodb') {
      const db = this.client.db(this.config.database);
      await db.collection(tableName).drop();
      return;
    }

    await this.execute(`DROP TABLE IF EXISTS ${tableName}${cascade ? ' CASCADE' : ''}`);
  }

  /**
   * Create index on table
   * 
   * @param {string} tableName - Table name
   * @param {Array|string} fields - Field(s) to index
   * @param {Object} options - Index options
   */
  async createIndex(tableName, fields, options = {}) {
    const fieldArray = Array.isArray(fields) ? fields : [fields];
    const indexName = options.name || `${tableName}_${fieldArray.join('_')}_idx`;
    const unique = options.unique || false;

    const fieldList = fieldArray.map(f => {
      if (typeof f === 'string') return f;
      return `${f.field}(${f.length || 255})`;
    }).join(', ');

    const sql = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${fieldList})`;
    await this.execute(sql);
  }
}

// ==================== MODEL BASE CLASS ====================
/**
 * Model - Base class for all database models
 * 
 * Represents a database table and provides:
 * - Static methods for table-level operations
 * - Instance methods for row-level operations
 * - Relationship definitions
 * 
 * @example
 * class User extends Model {
 *   static tableName = 'users';
 *   static fields = {
 *     id: new IntegerField({ primaryKey: true }),
 *     name: new StringField({ nullable: false }),
 *     email: new EmailField({ unique: true })
 *   };
 * }
 * 
 * // Define relationships
 * User.hasMany(Post, { foreignKey: 'userId', as: 'posts' });
 * 
 * // Query methods
 * const activeUsers = await User.query().where({ isActive: true }).get();
 * const user = await User.findOne({ email: 'test@example.com' });
 * 
 * // Instance methods
 * const user = new User({ name: 'John', email: 'john@example.com' });
 * await user.save();
 * user.isActive = false;
 * await user.save();
 * await user.delete();
 */
class Model {
  // ==================== STATIC PROPERTIES ====================
  
  /** @type {UltraORM|null} Reference to ORM instance */
  static orm = null;
  
  /** @type {string} Database table name */
  static tableName = null;
  
  /** @type {Object} Field definitions */
  static fields = {};
  
  /** @type {Array} Index definitions */
  static indexes = [];
  
  /** @type {Object} Model options */
  static options = {};
  
  /** @type {Object} Relationship definitions */
  static associations = {};

  // ==================== INSTANCE PROPERTIES ====================

  /**
   * Create a new Model instance
   * @param {Object} data - Initial data
   */
  constructor(data = {}) {
    this.data = {};
    this.isNew = true;
    this._changes = new Set();
    this._originalData = {};

    // Initialize fields with defaults
    for (const [fieldName, field] of Object.entries(this.constructor.fields)) {
      if (data[fieldName] !== undefined) {
        this.set(fieldName, data[fieldName]);
      } else if (field.default !== undefined) {
        const defaultValue = typeof field.default === 'function' ? field.default() : field.default;
        this.set(fieldName, defaultValue);
      } else {
        this.data[fieldName] = null;
      }
    }

    // Handle MongoDB _id
    if (data._id && !this.data.id) {
      this.data.id = data._id;
    }

    this._originalData = { ...this.data };
  }

  // ==================== GETTER/SETTER METHODS ====================

  /**
   * Set a field value
   * 
   * @param {string} fieldName - Field name
   * @param {*} value - Value to set
   * @returns {Model} - This instance
   */
  set(fieldName, value) {
    const field = this.constructor.fields[fieldName];
    if (!field) {
      throw new UltraORMError(`Field ${fieldName} does not exist in ${this.constructor.tableName}`);
    }
    
    // Prepare value (convert types, etc.)
    const preparedValue = field.prepareValue ? field.prepareValue(value) : value;
    field.validate(preparedValue);
    
    this.data[fieldName] = preparedValue;
    this._changes.add(fieldName);
    return this;
  }

  /**
   * Get a field value
   * 
   * @param {string} fieldName - Field name
   * @returns {*} - Field value
   */
  get(fieldName) {
    const field = this.constructor.fields[fieldName];
    if (field && field.fromDatabase) {
      return field.fromDatabase(this.data[fieldName]);
    }
    return this.data[fieldName];
  }

  /**
   * Fill multiple fields at once
   * 
   * @param {Object} data - Data to fill
   * @returns {Model} - This instance
   */
  fill(data) {
    for (const [fieldName, value] of Object.entries(data)) {
      if (fieldName in this.constructor.fields) {
        this.set(fieldName, value);
      }
    }
    return this;
  }

  /**
   * Merge data without validation
   * 
   * @param {Object} data - Data to merge
   * @returns {Model} - This instance
   */
  merge(data) {
    for (const [fieldName, value] of Object.entries(data)) {
      this.data[fieldName] = value;
      this._changes.add(fieldName);
    }
    return this;
  }

  // ==================== CRUD METHODS ====================

  /**
   * Save the instance (insert or update)
   * 
   * @returns {Promise<Model>} - This instance
   */
  async save() {
    this.validate();

    if (this.isNew) {
      await this.insert();
    } else {
      await this.update();
    }

    this._originalData = { ...this.data };
    this._changes.clear();
    return this;
  }

  /**
   * Create and save in one step
   * 
   * @param {Object} data - Initial data
   * @returns {Promise<Model>} - Created instance
   * 
   * @example
   * const user = await User.create({ name: 'John', email: 'john@example.com' });
   */
  static async create(data) {
    const instance = new this(data);
    await instance.save();
    return instance;
  }

  /**
   * Create multiple records
   * 
   * @param {Array<Object>} records - Records to create
   * @returns {Promise<Array<Model>>} - Created instances
   * 
   * @example
   * const users = await User.bulkCreate([
   *   { name: 'John', email: 'john@example.com' },
   *   { name: 'Jane', email: 'jane@example.com' }
   * ]);
   */
  static async bulkCreate(records) {
    if (!records || records.length === 0) return [];

    const dbType = this.orm.config.type;
    
    if (dbType === 'mongodb') {
      const col = this.orm.adapter.client.db(this.orm.config.database).collection(this.tableName);
      const result = await col.insertMany(records);
      return records.map((r, i) => {
        const inst = new this({ ...r, _id: result.insertedIds[i] });
        inst.isNew = false;
        return inst;
      });
    }

    // For SQL databases
    const columns = Object.keys(records[0]);
    const values = records.map(r => Object.values(r));
    
    const placeholders = records.map(() => 
      `(${columns.map(() => '?').join(', ')})`
    ).join(', ');

    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES ${placeholders}`;
    const flatValues = values.flat();

    const { result } = await this.orm.adapter.execute(sql, flatValues);
    
    const startId = result.insertId || 0;
    return records.map((r, i) => {
      const inst = new this(r);
      inst.isNew = false;
      if (result.insertId) {
        inst.data.id = startId + i;
      }
      return inst;
    });
  }

  /**
   * Delete the instance
   */
  async delete() {
    if (this.isNew) return;

    const primaryKey = this.constructor.primaryKeyName;
    const pkValue = this.get(primaryKey);
    
    if (!pkValue) {
      throw new UltraORMError('Cannot delete record without primary key');
    }

    const dbType = this.constructor.orm.config.type;
    
    if (dbType === 'mongodb') {
      const col = this.constructor.orm.adapter.client.db(this.constructor.orm.config.database).collection(this.constructor.tableName);
      await col.deleteOne({ _id: this.constructor._convertToObjectIdIfNeeded(primaryKey, pkValue) });
    } else {
      const sql = `DELETE FROM ${this.constructor.tableName} WHERE ${primaryKey} = ?`;
      await this.constructor.orm.adapter.execute(sql, [pkValue]);
    }
  }

  /**
   * Alias for delete
   */
  async destroy() { return this.delete(); }

  /**
   * Reload instance from database
   * 
   * @returns {Promise<Model>} - This instance
   */
  async refresh() {
    if (this.isNew) return this;

    const primaryKey = this.constructor.primaryKeyName;
    const pkValue = this.get(primaryKey);
    
    const fresh = await this.constructor.findOne({ [primaryKey]: pkValue });
    if (fresh) {
      this.data = { ...fresh.data };
      this._originalData = { ...fresh._originalData };
      this._changes.clear();
    }
    return this;
  }

  // ==================== VALIDATION ====================

  /**
   * Validate all fields
   */
  validate() {
    for (const [fieldName, field] of Object.entries(this.constructor.fields)) {
      const value = this.get(fieldName);
      field.validate(value);
    }
    return true;
  }

  // ==================== SERIALIZATION ====================

  /**
   * Convert to JSON object
   * 
   * @returns {Object} - JSON representation
   */
  toJSON() {
    return { ...this.data };
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return this.toJSON();
  }

  /**
   * Get attribute names
   */
  getAttributes() {
    return Object.keys(this.constructor.fields);
  }

  /**
   * Get changed attribute names
   */
  getChanged() {
    return [...this._changes];
  }

  /**
   * Check if instance has changes
   */
  isDirty() {
    return this._changes.size > 0;
  }

  // ==================== STATIC QUERY METHODS ====================

  /**
   * Create a new QuerySet for this model
   * 
   * @returns {QuerySet} - New QuerySet
   */
  static query() {
    return new QuerySet(this);
  }

  /**
   * Find records by conditions
   * 
   * @param {Object} where - Where conditions
   * @param {Object} options - Query options
   * @returns {Promise<Array<Model>>} - Found records
   */
  static async find(where = {}, options = {}) {
    if (this.orm.config.type === 'mongodb') {
      return this._findMongoDB(where, options);
    }

    const select = options.select || '*';
    let sql = `SELECT ${select} FROM ${this.tableName}`;
    const { clause, values } = this._buildWhereClause(where);
    if (clause) sql += ` WHERE ${clause}`;
    if (options.order) sql += ` ORDER BY ${options.order}`;
    if (options.limit) sql += ` LIMIT ${options.limit}`;
    if (options.offset) sql += ` OFFSET ${options.offset}`;

    const { rows } = await this.orm.adapter.execute(sql, values);
    return rows.map(row => {
      const instance = new this(row);
      instance.isNew = false;
      return instance;
    });
  }

  /**
   * MongoDB find implementation
   */
  static async _findMongoDB(where, options) {
    const db = this.orm.adapter.client.db(this.orm.config.database);
    const col = db.collection(this.tableName);
    
    const mongoWhere = {};
    for (const [k, v] of Object.entries(where || {})) {
      if (Array.isArray(v)) {
        mongoWhere[k] = { $in: v.map(x => this._convertToObjectIdIfNeeded(k, x)) };
      } else if (v && typeof v === 'object' && v.$in) {
        mongoWhere[k] = { $in: v.$in.map(x => this._convertToObjectIdIfNeeded(k, x)) };
      } else {
        mongoWhere[k] = this._convertToObjectIdIfNeeded(k, v);
      }
    }

    let cursor = col.find(mongoWhere);
    if (options.limit) cursor = cursor.limit(options.limit);
    if (options.offset) cursor = cursor.skip(options.offset);
    if (options.order) {
      const orderParts = options.order.split(',').map(s => s.trim());
      const sortObj = {};
      for (const part of orderParts) {
        const [f, d] = part.split(/\s+/);
        sortObj[f] = (d || 'ASC').toUpperCase() === 'ASC' ? 1 : -1;
      }
      cursor = cursor.sort(sortObj);
    }

    const docs = await cursor.toArray();
    return docs.map(d => {
      const inst = new this(d);
      inst.isNew = false;
      return inst;
    });
  }

  /**
   * Find one record by conditions
   * 
   * @param {Object} where - Where conditions
   * @param {Object} options - Query options
   * @returns {Promise<Model|null>} - Found record or null
   */
  static async findOne(where = {}, options = {}) {
    const results = await this.find(where, { ...options, limit: 1 });
    return results[0] || null;
  }

  /**
   * Find by primary key
   * 
   * @param {*} id - Primary key value
   * @returns {Promise<Model|null>} - Found record or null
   */
  static async findById(id) {
    const pk = this.primaryKeyName;
    return this.findOne({ [pk]: id });
  }

  /**
   * Find by primary key or throw error
   * 
   * @param {*} id - Primary key value
   * @param {string} message - Error message
   * @returns {Promise<Model>} - Found record
   * @throws {NotFoundError} - If not found
   */
  static async findOrFail(id, message = 'Record not found') {
    const record = await this.findById(id);
    if (!record) {
      throw new NotFoundError(message, this.tableName);
    }
    return record;
  }

  /**
   * Find one record or create if not exists
   * 
   * @param {Object} where - Where conditions
   * @param {Object} data - Data for creation if not found
   * @returns {Promise<Model>} - Found or created record
   * 
   * @example
   * const user = await User.firstOrCreate(
   *   { email: 'test@example.com' },
   *   { name: 'Test User', password: 'xxx' }
   * );
   */
  static async firstOrCreate(where, data = {}) {
    let instance = await this.findOne(where);
    if (!instance) {
      instance = await this.create({ ...where, ...data });
    }
    return instance;
  }

  /**
   * Update existing record or create if not exists
   * 
   * @param {Object} where - Where conditions
   * @param {Object} data - Data to update/create
   * @returns {Promise<Model>} - Updated or created record
   * 
   * @example
   * const user = await User.updateOrCreate(
   *   { email: 'test@example.com' },
   *   { name: 'Updated Name', lastLogin: new Date() }
   * );
   */
  static async updateOrCreate(where, data) {
    let instance = await this.findOne(where);
    if (instance) {
      instance.merge(data);
      await instance.save();
    } else {
      instance = await this.create({ ...where, ...data });
    }
    return instance;
  }

  /**
   * Build WHERE clause from conditions
   */
  static _buildWhereClause(where = {}) {
    const conditions = [];
    const values = [];

    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          conditions.push('1 = 0');
        } else {
          const placeholders = value.map(() => '?').join(', ');
          conditions.push(`${key} IN (${placeholders})`);
          values.push(...value);
        }
      } else if (value && typeof value === 'object') {
        for (const [op, opValue] of Object.entries(value)) {
          const handler = QUERY_OPERATORS[op];
          if (handler) {
            const result = handler(key, opValue);
            conditions.push(result.clause);
            if (result.value !== undefined && result.value !== null) {
              if (Array.isArray(result.value)) {
                values.push(...result.value);
              } else {
                values.push(result.value);
              }
            }
          }
        }
      } else {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
    }

    return {
      clause: conditions.join(' AND '),
      values
    };
  }

  /**
   * Convert value to ObjectId if needed (MongoDB)
   */
  static _convertToObjectIdIfNeeded(fieldName, value) {
    if (!this.orm || this.orm.config.type !== 'mongodb') return value;
    if (fieldName === 'id' || fieldName === '_id') {
      if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
        return new ObjectId(value);
      }
    }
    return value;
  }

  /**
   * Count records
   * 
   * @param {Object} where - Where conditions
   * @returns {Promise<number>} - Count
   */
  static async count(where = {}) {
    if (this.orm.config.type === 'mongodb') {
      const col = this.orm.adapter.client.db(this.orm.config.database).collection(this.tableName);
      const mongoWhere = {};
      for (const [k, v] of Object.entries(where || {})) {
        if (Array.isArray(v)) {
          mongoWhere[k] = { $in: v };
        } else if (v && typeof v === 'object' && v.$in) {
          mongoWhere[k] = { $in: v.$in };
        } else {
          mongoWhere[k] = v;
        }
      }
      return col.countDocuments(mongoWhere);
    }

    const { clause, values } = this._buildWhereClause(where);
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}${clause ? ' WHERE ' + clause : ''}`;
    const { rows } = await this.orm.adapter.execute(sql, values);
    const count = rows[0] ? (rows[0].count ?? Object.values(rows[0])[0]) : 0;
    return parseInt(count, 10);
  }

  /**
   * Check if records exist
   * 
   * @param {Object} where - Where conditions
   * @returns {Promise<boolean>} - True if exists
   */
  static async exists(where = {}) {
    const result = await this.findOne(where, { select: ['1'] });
    return result !== null;
  }

  /**
   * Get primary key field name
   */
  static get primaryKeyName() {
    for (const [name, field] of Object.entries(this.fields)) {
      if (field.primaryKey) return name;
    }
    return 'id';
  }

  // ==================== DATABASE OPERATIONS ====================

  /**
   * Sync model to database (create table)
   */
  static async sync() {
    const adapterType = this.orm.config.type;

    if (adapterType === 'mongodb') {
      const db = this.orm.adapter.client.db(this.orm.config.database);
      try {
        await db.createCollection(this.tableName).catch(() => {});
        for (const idx of this.indexes || []) {
          await db.collection(this.tableName).createIndex(idx.fields, idx.options || {});
        }
        console.log(`✅ MongoDB collection ${this.tableName} synced`);
      } catch (err) {
        console.error(`❌ Failed to sync collection ${this.tableName}:`, err.message);
        throw err;
      }
      return;
    }

    const fields = [];
    const foreignKeys = [];
    const indexes = [];

    for (const [fieldName, field] of Object.entries(this.fields)) {
      if (field instanceof ForeignKey || field instanceof OneToOneField) {
        fields.push(field.getSQLDefinition(fieldName, adapterType));
        foreignKeys.push(field.getForeignKeySQL(this.tableName, fieldName));
      } else {
        fields.push(field.getSQLDefinition(fieldName, adapterType));
      }

      // Check for index on this field
      if (field.index) {
        indexes.push({ fields: [fieldName], name: `idx_${this.tableName}_${fieldName}` });
      }
    }

    const allFields = [...fields];
    if (foreignKeys.length > 0) {
      allFields.push(...foreignKeys);
    }

    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${allFields.join(', ')})`;
    
    try {
      await this.orm.adapter.execute(sql);
      console.log(`✅ Table ${this.tableName} synced successfully`);

      // Create additional indexes
      for (const idx of this.indexes || []) {
        await this.orm.adapter.createIndex(this.tableName, idx.fields, idx.options);
      }
    } catch (error) {
      console.error(`❌ Failed to sync table ${this.tableName}:`, error.message);
      throw error;
    }
  }

  /**
   * Insert this instance into database
   */
  async insert() {
    if (this.constructor.orm.config.type === 'mongodb') {
      const col = this.constructor.orm.adapter.client.db(this.constructor.orm.config.database).collection(this.constructor.tableName);
      const data = { ...this.data };
      delete data._id;
      const res = await col.insertOne(data);
      const pkField = this.constructor.primaryKeyName;
      this.data[pkField] = res.insertedId;
      this.isNew = false;
      return;
    }

    const fields = [];
    const values = [];
    const isPostgres = this.constructor.orm.config.type === 'postgres';

    for (const [fieldName, value] of Object.entries(this.data)) {
      if (isPostgres && fieldName === 'id' && (value === null || value === undefined)) {
        continue;
      }

      if (value !== undefined) {
        fields.push(fieldName);
        values.push(value);
      }
    }

    if (fields.length === 0) throw new UltraORMError('No data to insert');

    const primaryKeyField = this.constructor.primaryKeyName;

    try {
      if (isPostgres) {
        const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${this.constructor.tableName} (${fields.join(',')}) VALUES (${placeholders}) RETURNING ${primaryKeyField}`;
        const { rows } = await this.constructor.orm.adapter.execute(sql, values);
        if (rows && rows[0] && rows[0][primaryKeyField] !== undefined) {
          this.data[primaryKeyField] = rows[0][primaryKeyField];
        }
        this.isNew = false;
        return;
      }

      const inserted = await this.constructor.orm.adapter.insertReturning(
        this.constructor.tableName,
        Object.fromEntries(fields.map((f, i) => [f, values[i]])),
        primaryKeyField
      );
      if (inserted && inserted[primaryKeyField] !== undefined) {
        this.data[primaryKeyField] = inserted[primaryKeyField];
      }
      this.isNew = false;
    } catch (err) {
      // Fallback for non-returning inserts
      const placeholders = fields.map(() => '?').join(', ');
      const sql = `INSERT INTO ${this.constructor.tableName} (${fields.join(',')}) VALUES (${placeholders})`;
      const { result } = await this.constructor.orm.adapter.execute(sql, values);
      if (result && result.insertId) {
        this.data[primaryKeyField] = result.insertId;
      }
      this.isNew = false;
    }
  }

  /**
   * Update this instance in database
   */
  async update() {
    if (this._changes.size === 0) return;

    const updates = [];
    const values = [];
    for (const fieldName of this._changes) {
      updates.push(`${fieldName} = ?`);
      values.push(this.data[fieldName]);
    }

    const primaryKey = this.constructor.primaryKeyName;
    const pkValue = this._originalData[primaryKey];

    if (!pkValue) throw new UltraORMError('No primary key for update');

    const sql = `UPDATE ${this.constructor.tableName} SET ${updates.join(', ')} WHERE ${primaryKey} = ?`;
    await this.constructor.orm.adapter.execute(sql, [...values, pkValue]);
  }

  // ==================== RELATIONSHIP METHODS ====================

  /**
   * Define belongsTo relationship
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * Post.belongsTo(User, { foreignKey: 'userId', as: 'author' });
   */
  static belongsTo(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName || targetModel);
    const foreignKey = options.foreignKey || `${as}_id`;
    const sourceKey = options.sourceKey || 'id';

    this.associations[as] = {
      type: 'belongsTo',
      target: targetModel,
      foreignKey,
      sourceKey,
      as
    };

    if (!this.fields[foreignKey]) {
      this.fields[foreignKey] = new ForeignKey(targetModel, { 
        nullable: options.nullable ?? false,
        index: options.index ?? true
      });
    }
  }

  /**
   * Define hasMany relationship
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * User.hasMany(Post, { foreignKey: 'userId', as: 'posts' });
   */
  static hasMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || ((targetModel.tableName || targetModel) + 's');
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const sourceKey = options.sourceKey || 'id';

    this.associations[as] = {
      type: 'hasMany',
      target: targetModel,
      foreignKey,
      sourceKey,
      as
    };

    // Auto-add foreign key to target model if not exists
    const targetTableName = typeof targetModel === 'string' ? targetModel : (targetModel.tableName || targetModel);
    if (typeof targetModel === 'function' && !targetModel.fields[foreignKey]) {
      targetModel.fields[foreignKey] = new ForeignKey(this, { nullable: options.nullable ?? false });
    }
  }

  /**
   * Define hasOne relationship
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * User.hasOne(Profile, { foreignKey: 'userId', as: 'profile' });
   */
  static hasOne(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName || targetModel);
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const sourceKey = options.sourceKey || 'id';

    this.associations[as] = {
      type: 'hasOne',
      target: targetModel,
      foreignKey,
      sourceKey,
      as
    };

    if (typeof targetModel === 'function' && !targetModel.fields[foreignKey]) {
      targetModel.fields[foreignKey] = new ForeignKey(this, {
        nullable: options.nullable ?? true,
        unique: true
      });
    }
  }

  /**
   * Define belongsToMany relationship
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * User.belongsToMany(Role, { through: UserRole, as: 'roles' });
   */
  static belongsToMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || ((targetModel.tableName || targetModel) + 's');
    const through = options.through;
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const otherKey = options.otherKey || `${targetModel.tableName || targetModel}_id`;
    
    if (!through) {
      throw new UltraORMError('belongsToMany requires a "through" option (junction table)');
    }

    this.associations[as] = {
      type: 'belongsToMany',
      target: targetModel,
      through,
      foreignKey,
      otherKey,
      as,
      pivot: options.withPivot || []
    };

    // Add inverse relationship
    if (typeof targetModel === 'function') {
      if (!targetModel.associations) targetModel.associations = {};
      const inverseAs = options.inverseAs || (this.tableName + 's');
      
      targetModel.associations[inverseAs] = {
        type: 'belongsToMany',
        target: this,
        through,
        foreignKey: otherKey,
        otherKey: foreignKey,
        as: inverseAs,
        pivot: options.withPivot || []
      };
    }
  }

  /**
   * Define hasManyThrough relationship
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * Country.hasManyThrough(User, { through: Post, as: 'postAuthors' });
   */
  static hasManyThrough(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || ((targetModel.tableName || targetModel) + 's');
    const through = options.through;
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const throughKey = options.throughKey || 'id';
    const targetKey = options.targetKey || `${(targetModel.tableName || targetModel)}_id`;
    
    this.associations[as] = {
      type: 'hasManyThrough',
      target: targetModel,
      through,
      foreignKey,
      throughKey,
      targetKey,
      as
    };
  }

  /**
   * Define morphMany relationship (polymorphic)
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * Post.morphMany(Comment, { morphName: 'commentable', as: 'comments' });
   */
  static morphMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || ((targetModel.tableName || targetModel) + 's');
    const morphName = options.morphName || 'commentable';
    const morphType = options.morphType || `${morphName}_type`;
    const morphId = options.morphId || `${morphName}_id`;
    
    this.associations[as] = {
      type: 'morphMany',
      target: targetModel,
      morphType,
      morphId,
      morphName,
      as
    };
  }

  /**
   * Define morphOne relationship (polymorphic)
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * Post.morphOne(Image, { morphName: 'imageable', as: 'image' });
   */
  static morphOne(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName || targetModel);
    const morphName = options.morphName || 'imageable';
    const morphType = options.morphType || `${morphName}_type`;
    const morphId = options.morphId || `${morphName}_id`;

    this.associations[as] = {
      type: 'morphOne',
      target: targetModel,
      morphType,
      morphId,
      morphName,
      as
    };
  }

  /**
   * Define morphTo relationship (polymorphic)
   * 
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * Comment.morphTo({ as: 'commentable' });
   */
  static morphTo(options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || 'commentable';
    const morphType = options.morphType || `${as}_type`;
    const morphId = options.morphId || `${as}_id`;
    
    this.associations[as] = {
      type: 'morphTo',
      morphType,
      morphId,
      as
    };
  }

  /**
   * Define morphToMany relationship (polymorphic many-to-many)
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * Post.morphToMany(Tag, { through: Taggable, morphName: 'taggable', as: 'tags' });
   */
  static morphToMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || ((targetModel.tableName || targetModel) + 's');
    const through = options.through;
    const morphName = options.morphName || 'taggable';
    const morphType = options.morphType || `${morphName}_type`;
    const morphId = options.morphId || `${morphName}_id`;
    const foreignKey = options.foreignKey || `${targetModel.tableName || targetModel}_id`;
    
    this.associations[as] = {
      type: 'morphToMany',
      target: targetModel,
      through,
      morphType,
      morphId,
      foreignKey,
      morphName,
      as
    };
  }

  /**
   * Define morphedByMany relationship
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   */
  static morphedByMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || ((targetModel.tableName || targetModel) + 's');
    const through = options.through;
    const morphName = options.morphName || 'taggable';
    const morphType = options.morphType || `${morphName}_type`;
    const morphId = options.morphId || `${morphName}_id`;
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    
    this.associations[as] = {
      type: 'morphedByMany',
      target: targetModel,
      through,
      morphType,
      morphId,
      foreignKey,
      morphName,
      as
    };
  }

  /**
   * Define self-referential relationship
   * 
   * @param {Object} options - Relationship options
   * @returns {void}
   * 
   * @example
   * Category.belongsToSelf({ as: 'parent', childrenAs: 'children' });
   */
  static belongsToSelf(options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || 'parent';
    const foreignKey = options.foreignKey || 'parent_id';
    
    this.associations[as] = {
      type: 'belongsTo',
      target: this,
      foreignKey,
      as
    };
    
    const childrenAs = options.childrenAs || 'children';
    this.associations[childrenAs] = {
      type: 'hasMany',
      target: this,
      foreignKey,
      as: childrenAs
    };
  }

  /**
   * Define embedsOne relationship (MongoDB)
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   */
  static embedsOne(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName || targetModel);
    
    this.associations[as] = {
      type: 'embedsOne',
      target: targetModel,
      as
    };
  }

  /**
   * Define embedsMany relationship (MongoDB)
   * 
   * @param {Model} targetModel - Target model
   * @param {Object} options - Relationship options
   * @returns {void}
   */
  static embedsMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || ((targetModel.tableName || targetModel) + 's');
    
    this.associations[as] = {
      type: 'embedsMany',
      target: targetModel,
      as
    };
  }
}

// ==================== ULTRAORM CORE CLASS ====================
/**
 * UltraORM - Main ORM class
 * 
 * Provides the main interface for:
 * - Database connection management
 * - Model registration
 * - Migration management
 * - Seeding functionality
 * - Data transfer between databases
 * 
 * @example
 * const orm = new UltraORM({
 *   type: 'postgres',
 *   host: 'localhost',
 *   database: 'mydb',
 *   user: 'user',
 *   password: 'password'
 * });
 * 
 * await orm.connect();
 * await orm.migrate();
 * 
 * // Query
 * const users = await orm.user.find({ status: 'active' });
 */
class UltraORM {
  // ==================== SINGLETON PATTERN ====================
  
  /** @type {UltraORM|null} Singleton instance */
  static instance = null;

  /**
   * Create a new UltraORM instance (or return existing singleton)
   * @param {Object} config - Database configuration
   */
  constructor(config) {
    // Singleton: Return existing instance if available
    if (UltraORM.instance) {
      return UltraORM.instance;
    }

    this.config = config;
    this.connected = false;
    this.models = new Map();
    this.adapter = new DBAdapter(config);

    // Store singleton
    UltraORM.instance = this;
  }

  // ==================== CONNECTION MANAGEMENT ====================

  /**
   * Connect to the database
   * 
   * @returns {Promise<UltraORM>} - This instance
   */
  async connect() {
    if (this.connected) return this;
    await this.adapter.connect();
    this.connected = true;
    console.log('🚀 UltraORM connected successfully');
    return this;
  }

  /**
   * Disconnect from the database
   */
  async disconnect() {
    if (!this.connected) return;
    await this.adapter.disconnect();
    this.connected = false;
    console.log('👋 UltraORM disconnected');
  }

  // ==================== MODEL MANAGEMENT ====================

  /**
   * Get a registered model by name
   * 
   * @param {string} name - Model name
   * @returns {Model|undefined} - Model class or undefined
   */
  model(name) {
    return this.models.get(name);
  }

  /**
   * Register a model with this ORM
   * 
   * @param {Model} ModelClass - Model class to register
   * @returns {Model} - The registered model class
   * 
   * @example
   * orm.registerModel(User);
   * orm.registerModel(Post);
   */
  registerModel(ModelClass) {
    // Wire the model to this ORM instance
    ModelClass.orm = this;
    
    if (!ModelClass.fields) ModelClass.fields = {};
    if (!ModelClass.associations) ModelClass.associations = {};

    // Store in internal map
    this.models.set(ModelClass.tableName, ModelClass);

    // Attach to ORM instance for easy access
    // Allows: orm.User.create()
    this[ModelClass.name] = ModelClass;
    
    // Lowercase access (Prisma style)
    // Allows: orm.user.create()
    const lowerCaseName = ModelClass.name.charAt(0).toLowerCase() + ModelClass.name.slice(1);
    this[lowerCaseName] = ModelClass;

    console.log(`[UltraORM] Registered model: ${ModelClass.name} (table: ${ModelClass.tableName})`);
    
    return ModelClass;
  }

  // ==================== MIGRATION MANAGEMENT ====================

  /**
   * Create migrations directory if it doesn't exist
   */
  _ensureMigrationsDir() {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      console.log(`[UltraORM] Created migrations directory: ${migrationsDir}`);
    }
    return migrationsDir;
  }

  /**
   * Run all migrations
   * 
   * @returns {Promise<void>}
   */
  async migrate() {
    console.log('🔄 Starting database migration...');
    
    // Ensure migrations directory exists
    this._ensureMigrationsDir();

    for (const [name, model] of this.models) {
      await model.sync();
    }
    
    console.log('✅ Database migration completed');
  }

  /**
   * Create a migration file
   * 
   * @param {string} name - Migration name
   * @returns {Promise<string>} - Migration file path
   * 
   * @example
   * await orm.makeMigration('create-users-table');
   */
  async makeMigration(name) {
    const migrationsDir = this._ensureMigrationsDir();
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `${timestamp}_${name}.js`;
    const filepath = path.join(migrationsDir, filename);

    const migrationContent = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  /**
   * Run the migration
   * @param {Object} orm - UltraORM instance
   */
  async up(orm) {
    // Add your migration code here
    // Example:
    // await orm.adapter.execute(\`
    //   CREATE TABLE IF NOT EXISTS users (
    //     id SERIAL PRIMARY KEY,
    //     name VARCHAR(255) NOT NULL,
    //     email VARCHAR(255) UNIQUE NOT NULL
    //   )
    // \`);
  },

  /**
   * Reverse the migration
   * @param {Object} orm - UltraORM instance
   */
  async down(orm) {
    // Add your rollback code here
    // Example:
    // await orm.adapter.execute('DROP TABLE IF EXISTS users');
  }
};
`;

    fs.writeFileSync(filepath, migrationContent);
    console.log(`[UltraORM] Created migration: ${filename}`);
    
    return filepath;
  }

  /**
   * Run pending migrations
   */
  async migrateRun() {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('[UltraORM] No migrations directory found');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    // Create migrations table if not exists
    if (this.config.type !== 'mongodb') {
      try {
        await this.adapter.execute(`
          CREATE TABLE IF NOT EXISTS __migrations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch (e) {
        // Table might already exist
      }
    }

    for (const file of files) {
      console.log(`[UltraORM] Running migration: ${file}`);
      const migration = require(path.join(migrationsDir, file));
      try {
        await migration.up(this);
        
        // Record migration
        if (this.config.type !== 'mongodb') {
          await this.adapter.execute(
            'INSERT INTO __migrations (name) VALUES (?) ON CONFLICT (name) DO NOTHING',
            [file]
          );
        }
        
        console.log(`✅ Migration completed: ${file}`);
      } catch (error) {
        console.error(`❌ Migration failed: ${file}`);
        throw error;
      }
    }
  }

  /**
   * Rollback last migration
   */
  async migrateRollback() {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('[UltraORM] No migrations directory found');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.log('[UltraORM] No migrations to rollback');
      return;
    }

    const file = files[0];
    console.log(`[UltraORM] Rolling back migration: ${file}`);
    
    const migration = require(path.join(migrationsDir, file));
    try {
      await migration.down(this);
      
      // Remove migration record
      if (this.config.type !== 'mongodb') {
        await this.adapter.execute(
          'DELETE FROM __migrations WHERE name = ?',
          [file]
        );
      }
      
      console.log(`✅ Rollback completed: ${file}`);
    } catch (error) {
      console.error(`❌ Rollback failed: ${file}`);
      throw error;
    }
  }

  /**
   * Reset all migrations
   */
  async migrateReset() {
    console.log('⚠️  Resetting all migrations...');
    
    const migrationsDir = path.join(process.cwd(), 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('[UltraORM] No migrations directory found');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort()
      .reverse();

    for (const file of files) {
      console.log(`[UltraORM] Rolling back: ${file}`);
      const migration = require(path.join(migrationsDir, file));
      try {
        await migration.down(this);
      } catch (error) {
        console.warn(`⚠️  Could not rollback ${file}: ${error.message}`);
      }
    }

    // Clear migrations table
    if (this.config.type !== 'mongodb') {
      try {
        await this.adapter.execute('DELETE FROM __migrations');
      } catch (e) {
        // Table might not exist
      }
    }

    console.log('✅ All migrations reset');
  }

  /**
   * Refresh migrations (reset + run)
   */
  async migrateRefresh() {
    await this.migrateReset();
    await this.migrateRun();
  }

  // ==================== SEEDING ====================

  /**
   * Create seeders directory and file
   * 
   * @param {string} name - Seeder name
   * @returns {Promise<string>} - Seeder file path
   */
  async makeSeeder(name) {
    const seedersDir = path.join(process.cwd(), 'seeders');
    if (!fs.existsSync(seedersDir)) {
      fs.mkdirSync(seedersDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `${timestamp}_${name}.js`;
    const filepath = path.join(seedersDir, filename);

    const seederContent = `/**
 * Seeder: ${name}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  /**
   * Run the seeder
   * @param {Object} orm - UltraORM instance
   */
  async run(orm) {
    // Add your seeding code here
    // Example:
    // await orm.User.create({ name: 'Admin', email: 'admin@example.com', role: 'admin' });
  },

  /**
   * Clean up seeded data
   * @param {Object} orm - UltraORM instance
   */
  async clean(orm) {
    // Add cleanup code here
    // Example:
    // await orm.adapter.execute('DELETE FROM users WHERE email LIKE "%@example.com"');
  }
};
`;

    fs.writeFileSync(filepath, seederContent);
    console.log(`[UltraORM] Created seeder: ${filename}`);
    
    return filepath;
  }

  /**
   * Run all seeders
   */
  async seed() {
    const seedersDir = path.join(process.cwd(), 'seeders');
    
    if (!fs.existsSync(seedersDir)) {
      console.log('[UltraORM] No seeders directory found');
      return;
    }

    const files = fs.readdirSync(seedersDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    for (const file of files) {
      console.log(`[UltraORM] Running seeder: ${file}`);
      const seeder = require(path.join(seedersDir, file));
      try {
        await seeder.run(this);
        console.log(`✅ Seeder completed: ${file}`);
      } catch (error) {
        console.error(`❌ Seeder failed: ${file}`);
        throw error;
      }
    }
  }

  /**
   * Refresh seeders (clean + run)
   */
  async seedRefresh() {
    const seedersDir = path.join(process.cwd(), 'seeders');
    
    if (fs.existsSync(seedersDir)) {
      const files = fs.readdirSync(seedersDir)
        .filter(f => f.endsWith('.js'))
        .sort()
        .reverse();

      // Clean in reverse order
      for (const file of files) {
        const seeder = require(path.join(seedersDir, file));
        if (seeder.clean) {
          try {
            await seeder.clean(this);
          } catch (e) {
            console.warn(`⚠️  Could not clean ${file}: ${e.message}`);
          }
        }
      }
    }

    await this.seed();
  }

  // ==================== TRANSACTION MANAGEMENT ====================

  /**
   * Execute a transaction
   * 
   * @param {Function} callback - Transaction callback
   * @returns {Promise<*>} - Transaction result
   * 
   * @example
   * const user = await orm.transaction(async (client) => {
   *   const user = await orm.User.create({ name: 'John', email: 'john@example.com' });
   *   await orm.Profile.create({ userId: user.id, bio: 'Hello' });
   *   return user;
   * });
   */
  /**
   * Execute a transaction with automatic retry and deadlock handling
   * 
   * @param {Function} callback - Transaction callback
   * @param {Object} options - Transaction options
   * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
   * @param {number} options.retryDelay - Delay between retries in ms (default: 100)
   * @param {string} options.isolationLevel - Isolation level
   * @param {number} options.lockTimeout - Lock timeout in seconds
   * @returns {Promise<*>} - Transaction result
   * 
   * @example
   * const user = await orm.transaction(async (client) => {
   *   const user = await orm.User.create({ name: 'John' });
   *   await orm.Profile.create({ userId: user.id });
   *   return user;
   * }, { maxRetries: 5 });
   */
  async transaction(callback, options = {}) {
    return await this.adapter.transaction(callback, options);
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Create a raw expression
   * 
   * @param {string} expression - Raw SQL expression
   * @returns {Object} - Raw expression object
   * 
   * @example
   * await Model.query().update({ count: orm.raw('count + 1') });
   */
  raw(expression) {
    return { __ultraRaw: expression };
  }

  /**
   * Execute raw query
   * 
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} - Query result
   */
  async query(sql, params = []) {
    return this.adapter.execute(sql, params);
  }

  /**
   * Check if table exists
   * 
   * @param {string} tableName - Table name
   * @returns {Promise<boolean>} - True if exists
   */
  async tableExists(tableName) {
    return this.adapter.tableExists(tableName);
  }

  /**
   * Get all tables
   * 
   * @returns {Promise<Array<string>>} - List of table names
   */
  async getTables() {
    return this.adapter.getTables();
  }

  /**
   * Describe table structure
   * 
   * @param {string} tableName - Table name
   * @returns {Promise<Array>} - Column definitions
   */
  async describe(tableName) {
    return this.adapter.describe(tableName);
  }

  /**
   * Truncate a table
   * 
   * @param {string} tableName - Table name
   * @param {boolean} cascade - Use CASCADE
   */
  async truncate(tableName, cascade = false) {
    return this.adapter.truncate(tableName, cascade);
  }

  /**
   * Drop a table
   * 
   * @param {string} tableName - Table name
   * @param {boolean} cascade - Use CASCADE
   */
  async dropTable(tableName, cascade = false) {
    return this.adapter.dropTable(tableName, cascade);
  }

  // ==================== DATA TRANSFER ====================

  /**
   * Transfer data from one database to another
   * 
   * @param {Object} targetConfig - Target database configuration
   * @param {Object} options - Transfer options
   * @returns {Promise<Object>} - Transfer statistics
   * 
   * @example
   * const stats = await orm.transferTo({
   *   type: 'mysql',
   *   host: 'remote-host',
   *   database: 'remotedb',
   *   user: 'root',
   *   password: 'password'
   * }, {
   *   tables: ['users', 'posts'], // Only transfer these tables
   *   batchSize: 1000,
   *   clearTarget: false
   * });
   */
  async transferTo(targetConfig, options = {}) {
    const batchSize = options.batchSize || 1000;
    const tables = options.tables || await this.getTables();
    const clearTarget = options.clearTarget || false;

    // Create target adapter
    const targetAdapter = new DBAdapter(targetConfig);
    await targetAdapter.connect();

    const stats = {
      tables: {},
      totalRows: 0,
      errors: []
    };

    console.log('[UltraORM] Starting data transfer...');

    try {
      for (const tableName of tables) {
        console.log(`[UltraORM] Transferring table: ${tableName}`);
        
        try {
          // Get source data
          const { rows } = await this.adapter.execute(`SELECT * FROM ${tableName}`);
          
          if (rows.length === 0) {
            console.log(`  No data in ${tableName}`);
            stats.tables[tableName] = { rows: 0, status: 'skipped' };
            continue;
          }

          // Clear target table if requested
          if (clearTarget) {
            await targetAdapter.truncate(tableName);
          }

          // Transfer in batches
          let transferred = 0;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const columns = Object.keys(batch[0]);
            const values = batch.map(r => Object.values(r));
            
            const placeholders = batch.map(() => 
              `(${columns.map(() => '?').join(', ')})`
            ).join(', ');

            const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders}`;
            
            try {
              await targetAdapter.execute(sql, values.flat());
              transferred += batch.length;
            } catch (batchError) {
              // Try one by one for failed batches
              for (const record of batch) {
                try {
                  const vals = Object.values(record);
                  const p = columns.map(() => '?').join(', ');
                  await targetAdapter.execute(
                    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${p})`,
                    vals
                  );
                  transferred++;
                } catch (recordError) {
                  stats.errors.push({
                    table: tableName,
                    record: record,
                    error: recordError.message
                  });
                }
              }
            }
          }

          console.log(`  ✅ Transferred ${transferred}/${rows.length} rows`);
          stats.tables[tableName] = { rows: transferred, status: 'success' };
          stats.totalRows += transferred;

        } catch (tableError) {
          console.error(`  ❌ Failed to transfer ${tableName}: ${tableError.message}`);
          stats.tables[tableName] = { rows: 0, status: 'error', error: tableError.message };
          stats.errors.push({ table: tableName, error: tableError.message });
        }
      }

      console.log(`[UltraORM] Transfer complete. Total rows: ${stats.totalRows}`);
      
    } finally {
      await targetAdapter.disconnect();
    }

    return stats;
  }

  /**
   * Clone database structure (without data)
   * 
   * @param {Object} targetConfig - Target database configuration
   * @param {Object} options - Clone options
   * @returns {Promise<Object>} - Clone statistics
   */
  async cloneStructure(targetConfig, options = {}) {
    const tables = options.tables || await this.getTables();

    const targetAdapter = new DBAdapter(targetConfig);
    await targetAdapter.connect();

    const stats = {
      tables: {},
      errors: []
    };

    console.log('[UltraORM] Starting structure clone...');

    try {
      for (const tableName of tables) {
        console.log(`[UltraORM] Cloning table structure: ${tableName}`);
        
        try {
          // Get source table structure
          const columns = await this.adapter.describe(tableName);
          
          // Build CREATE TABLE statement
          let createSQL = `CREATE TABLE ${tableName} (`;
          const colDefs = [];
          
          for (const col of columns) {
            let colDef = `${col.column_name || col.Field} ${col.data_type || col.Type}`;
            
            if (col.is_nullable === 'NO' || col.Null === 'NO') {
              colDef += ' NOT NULL';
            }
            if (col.column_default !== undefined && col.column_default !== null) {
              colDef += ` DEFAULT ${col.column_default}`;
            }
            
            colDefs.push(colDef);
          }
          
          createSQL += colDefs.join(', ') + ')';
          
          // Execute on target
          await targetAdapter.execute(createSQL);
          console.log(`  ✅ Cloned ${tableName}`);
          stats.tables[tableName] = { status: 'success' };

        } catch (tableError) {
          console.error(`  ❌ Failed to clone ${tableName}: ${tableError.message}`);
          stats.tables[tableName] = { status: 'error', error: tableError.message };
          stats.errors.push({ table: tableName, error: tableError.message });
        }
      }

      console.log('[UltraORM] Structure clone complete');
      
    } finally {
      await targetAdapter.disconnect();
    }

    return stats;
  }
}

// ==================== MODEL DEFINITION HELPERS ====================

/**
 * Decorator for defining model table name
 * 
 * @param {string} tableName - Database table name
 * @returns {Function} - Class decorator
 * 
 * @example
 * @model('users')
 * class User extends Model {}
 */
function model(tableName) {
  return function (target) {
    target.tableName = tableName;
    target.options = target.options || {};
    if (!target.fields) target.fields = {};
    if (!target.associations) target.associations = {};
  };
}

/**
 * Decorator for defining model fields
 * 
 * @param {Field} fieldType - Field type class
 * @param {Object} options - Field options
 * @returns {Function} - Property decorator
 * 
 * @example
 * class User extends Model {
 *   @field(StringField, { nullable: false })
 *   name;
 * }
 */
function field(fieldType, options = {}) {
  return function (target, propertyName) {
    if (!target.constructor.fields) target.constructor.fields = {};
    target.constructor.fields[propertyName] = new fieldType(options);
  };
}

// ==================== EXPORTS ====================

/**
 * UltraORM Module Exports
 * 
 * Usage:
 * const { Model, UltraORM, StringField, IntegerField } = require('ultraorm');
 * 
 * // Or import specific components
 * const UltraORM = require('ultraorm').UltraORM;
 * const Model = require('ultraorm').Model;
 */
module.exports = {
  // Core classes
  UltraORM,
  Model,
  QuerySet,
  DBAdapter,

  // Field types
  Field,
  IntegerField,
  BigIntegerField,
  SmallIntegerField,
  TinyIntegerField,
  DecimalField,
  StringField,
  CharField,
  TextField,
  EmailField,
  SlugField,
  URLField,
  UUIDField,
  EnumField,
  DateField,
  TimeField,
  DateTimeField,
  BooleanField,
  JSONField,
  FloatField,
  BinaryField,
  ForeignKey,
  OneToOneField,

  // Query operators
  QUERY_OPERATORS,

  // Decorators
  model,
  field,

  // Error classes
  UltraORMError,
  ValidationError,
  NotFoundError,
  DatabaseError,

  // Utility functions
  toSnakeCase,
  toCamelCase,
  deepClone,
  escapeIdentifier
};
