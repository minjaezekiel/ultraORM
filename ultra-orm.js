/**
 * ================================================================================
 * UltraORM - Main Entry Point
 * ================================================================================
 * 
 * This is the main entry point for UltraORM. Import field types, Model class,
 * and the UltraORM class from here.
 * 
 * USAGE:
 * 
 * // Import everything
 * const { Model, UltraORM, StringField, IntegerField, ForeignKey } = require('ultraorm');
 * 
 * // Import only what you need
 * const Model = require('ultraorm').Model;
 * const UltraORM = require('ultraorm').UltraORM;
 * 
 * // Import specific field types
 * const { StringField, IntegerField, BooleanField, DateTimeField, ForeignKey, EnumField } = require('ultraorm');
 * 
 * ================================================================================
 */

'use strict';

const Core = require('./core');

// Re-export all classes and utilities
// This provides a clean API for users to import from

/**
 * Main UltraORM class - Start here
 * 
 * @example
 * const orm = new UltraORM({
 *   type: 'postgres',
 *   host: 'localhost',
 *   database: 'mydb',
 *   user: 'user',
 *   password: 'password'
 * });
 * await orm.connect();
 */
const UltraORM = Core.UltraORM;

/**
 * Base Model class - All your models should extend this
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
 */
const Model = Core.Model;

/**
 * QuerySet class - For building complex queries
 * 
 * @example
 * const users = await User.query()
 *   .where({ status: 'active' })
 *   .order('created_at', 'DESC')
 *   .take(10)
 *   .get();
 */
const QuerySet = Core.QuerySet;

/**
 * Database Adapter - Handles database connections
 */
const DBAdapter = Core.DBAdapter;

// ==================== FIELD TYPES ====================
// All field types available in UltraORM

/**
 * Base Field class
 */
const Field = Core.Field;

/**
 * IntegerField - For integer values
 * 
 * @example
 * new IntegerField({ min: 0, max: 100 })
 */
const IntegerField = Core.IntegerField;

/**
 * BigIntegerField - For large integers
 */
const BigIntegerField = Core.BigIntegerField;

/**
 * SmallIntegerField - For small integers
 */
const SmallIntegerField = Core.SmallIntegerField;

/**
 * TinyIntegerField - For tiny integers (0-255)
 */
const TinyIntegerField = Core.TinyIntegerField;

/**
 * DecimalField - For precise decimal values
 * 
 * @example
 * new DecimalField({ precision: 10, scale: 2 })
 */
const DecimalField = Core.DecimalField;

/**
 * StringField - For variable-length strings
 * 
 * @example
 * new StringField({ maxLength: 255 })
 */
const StringField = Core.StringField;

/**
 * CharField - For fixed/variable-length characters (alias for StringField)
 */
const CharField = Core.CharField;

/**
 * TextField - For long text content
 * 
 * @example
 * new TextField()           // TEXT
 * new TextField({ medium: true })  // MEDIUMTEXT
 * new TextField({ long: true })    // LONGTEXT
 */
const TextField = Core.TextField;

/**
 * EmailField - For email addresses (with built-in validation)
 */
const EmailField = Core.EmailField;

/**
 * SlugField - For URL-friendly slugs
 */
const SlugField = Core.SlugField;

/**
 * URLField - For URLs
 */
const URLField = Core.URLField;

/**
 * UUIDField - For UUID values
 */
const UUIDField = Core.UUIDField;

/**
 * EnumField - For enum values
 * 
 * @example
 * new EnumField({ values: ['active', 'inactive', 'pending'] })
 */
const EnumField = Core.EnumField;

/**
 * DateField - For date values (no time)
 */
const DateField = Core.DateField;

/**
 * TimeField - For time values (no date)
 */
const TimeField = Core.TimeField;

/**
 * DateTimeField - For date and time values
 * 
 * @example
 * new DateTimeField({ autoNow: true })      // Updates on every save
 * new DateTimeField({ autoNowAdd: true })   // Only on creation
 */
const DateTimeField = Core.DateTimeField;

/**
 * BooleanField - For true/false values
 */
const BooleanField = Core.BooleanField;

/**
 * JSONField - For JSON data
 * 
 * @example
 * new JSONField({ default: {} })
 */
const JSONField = Core.JSONField;

/**
 * FloatField - For floating-point numbers
 */
const FloatField = Core.FloatField;

/**
 * BinaryField - For binary data
 */
const BinaryField = Core.BinaryField;

/**
 * ForeignKey - For foreign key relationships
 * 
 * @example
 * new ForeignKey(User, { onDelete: 'CASCADE' })
 */
const ForeignKey = Core.ForeignKey;

/**
 * OneToOneField - For one-to-one relationships
 */
const OneToOneField = Core.OneToOneField;

// ==================== ERROR CLASSES ====================

/**
 * Base UltraORM Error
 */
const UltraORMError = Core.UltraORMError;

/**
 * Validation Error
 */
const ValidationError = Core.ValidationError;

/**
 * Not Found Error
 */
const NotFoundError = Core.NotFoundError;

/**
 * Database Error
 */
const DatabaseError = Core.DatabaseError;

// ==================== DECORATORS ====================

/**
 * Decorator for defining model table name
 * 
 * @example
 * @model('users')
 * class User extends Model {}
 */
const model = Core.model;

/**
 * Decorator for defining model fields
 * 
 * @example
 * class User extends Model {
 *   @field(StringField, { nullable: false })
 *   name;
 * }
 */
const field = Core.field;

// ==================== UTILITY FUNCTIONS ====================

/**
 * Convert camelCase to snake_case
 */
const toSnakeCase = Core.toSnakeCase;

/**
 * Convert snake_case to camelCase
 */
const toCamelCase = Core.toCamelCase;

/**
 * Deep clone an object
 */
const deepClone = Core.deepClone;

/**
 * Escape SQL identifier
 */
const escapeIdentifier = Core.escapeIdentifier;

// ==================== QUERY OPERATORS ====================

/**
 * Query operators for building WHERE clauses
 * 
 * Supported operators:
 * - $eq, $ne, $gt, $gte, $lt, $lte
 * - $in, $notIn
 * - $isNull, $isNotNull
 * - $like, $notLike, $contains, $startsWith, $endsWith
 * - $between, $notBetween
 * - $exists
 */
const QUERY_OPERATORS = Core.QUERY_OPERATORS;

// ==================== MAIN EXPORTS ====================

/**
 * Complete UltraORM module exports
 * 
 * @example
 * // Import all exports
 * const UltraORM = require('ultraorm');
 * 
 * // Destructure what you need
 * const { Model, UltraORM, StringField } = require('ultraorm');
 * 
 * // Import just the UltraORM class
 * const UltraORM = require('ultraorm').UltraORM;
 */
module.exports = {
  // Core classes
  UltraORM,
  Model,
  QuerySet,
  DBAdapter,

  // Field types - All
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

  // Error classes
  UltraORMError,
  ValidationError,
  NotFoundError,
  DatabaseError,

  // Decorators
  model,
  field,

  // Utility functions
  toSnakeCase,
  toCamelCase,
  deepClone,
  escapeIdentifier,

  // Query operators
  QUERY_OPERATORS
};
