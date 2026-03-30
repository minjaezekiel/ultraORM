/**
 * ================================================================================
 * UltraORM - Comprehensive Unit Tests
 * ================================================================================
 * 
 * This file contains comprehensive unit tests for UltraORM.
 * Run with: npm test
 * 
 * Tests cover:
 * - Field types and validation
 * - Query builder operations
 * - Model CRUD operations
 * - Relationship handling
 * - Transaction support
 * - Error handling
 * 
 * ================================================================================
 */

'use strict';

const assert = require('assert');

// Mock the database adapter for testing
class MockDBAdapter {
  constructor(type = 'postgres') {
    this.type = type;
    this.pool = {};
    this.connected = false;
    this.executedQueries = [];
    this.mockData = new Map();
  }

  async connect() {
    this.connected = true;
    return this;
  }

  async disconnect() {
    this.connected = false;
  }

  async execute(sql, params = []) {
    this.executedQueries.push({ sql, params });
    
    // Simulate response based on query type
    if (sql.toUpperCase().includes('SELECT COUNT')) {
      return { rows: [{ count: 0 }] };
    }
    if (sql.toUpperCase().includes('INSERT')) {
      return { rows: [{ id: 1 }], result: { insertId: 1, affectedRows: 1 } };
    }
    if (sql.toUpperCase().includes('UPDATE')) {
      return { rows: [], result: { affectedRows: 1 } };
    }
    if (sql.toUpperCase().includes('DELETE')) {
      return { rows: [], result: { affectedRows: 1 } };
    }
    
    return { rows: [], result: {} };
  }

  async transaction(callback) {
    return await callback({
      query: (sql, params) => this.execute(sql, params),
      execute: (sql, params) => this.execute(sql, params)
    });
  }

  // Helper to set mock data
  setMockData(table, data) {
    this.mockData.set(table, data);
  }

  // Helper to get mock data
  getMockData(table) {
    return this.mockData.get(table) || [];
  }
}

// Import UltraORM classes
const {
  Model,
  Field,
  IntegerField,
  BigIntegerField,
  StringField,
  CharField,
  TextField,
  EmailField,
  SlugField,
  URLField,
  UUIDField,
  DecimalField,
  FloatField,
  BooleanField,
  DateField,
  TimeField,
  DateTimeField,
  EnumField,
  JSONField,
  ForeignKey,
  OneToOneField,
  QuerySet,
  UltraORM,
  ValidationError,
  NotFoundError,
  UltraORMError,
  toSnakeCase,
  toCamelCase,
  deepClone,
  QUERY_OPERATORS
} = require('../core.js');

// ==================== TEST UTILITIES ====================

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn, errorClass, message = '') {
  try {
    fn();
    throw new Error(`${message} Expected function to throw`);
  } catch (error) {
    if (errorClass && !(error instanceof errorClass)) {
      throw new Error(`${message} Expected ${errorClass.name}, got ${error.constructor.name}`);
    }
  }
}

// ==================== FIELD TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - FIELD TESTS');
console.log('='.repeat(60) + '\n');

let testsPassed = 0;
let testsFailed = 0;

// Test: Field Base Class
if (runTest('Field: Basic field creation', () => {
  const field = new Field();
  assertEqual(field.nullable, true);
  assertEqual(field.unique, false);
  assertEqual(field.primaryKey, false);
})) testsPassed++; else testsFailed++;

// Test: Field validation - nullable
if (runTest('Field: Nullable validation', () => {
  const field = new Field({ nullable: false });
  assertThrows(() => field.validate(null), ValidationError);
  assertEqual(field.validate('value'), true);
})) testsPassed++; else testsFailed++;

// Test: IntegerField
if (runTest('IntegerField: Basic creation', () => {
  const field = new IntegerField();
  assertEqual(field.dbType, 'INT');
})) testsPassed++; else testsFailed++;

if (runTest('IntegerField: Validation with min/max', () => {
  const field = new IntegerField({ min: 0, max: 100 });
  field.validate(50);
  assertThrows(() => field.validate(-1), ValidationError);
  assertThrows(() => field.validate(101), ValidationError);
})) testsPassed++; else testsFailed++;

if (runTest('IntegerField: Integer type validation', () => {
  const field = new IntegerField();
  assertThrows(() => field.validate('string'), ValidationError);
  assertThrows(() => field.validate(3.14), ValidationError);
  assertEqual(field.validate(42), true);
})) testsPassed++; else testsFailed++;

// Test: BigIntegerField
if (runTest('BigIntegerField: Database type', () => {
  const field = new BigIntegerField();
  assertEqual(field.dbType, 'BIGINT');
})) testsPassed++; else testsFailed++;

// Test: SmallIntegerField
if (runTest('SmallIntegerField: Database type', () => {
  const field = new SmallIntegerField();
  assertEqual(field.dbType, 'SMALLINT');
})) testsPassed++; else testsFailed++;

// Test: TinyIntegerField
if (runTest('TinyIntegerField: Database type', () => {
  const field = new TinyIntegerField();
  assertEqual(field.dbType, 'TINYINT');
  assertEqual(field.max, 255);
})) testsPassed++; else testsFailed++;

// Test: StringField
if (runTest('StringField: Basic creation', () => {
  const field = new StringField({ maxLength: 100 });
  assertEqual(field.maxLength, 100);
  assertEqual(field.dbType.includes('VARCHAR'), true);
})) testsPassed++; else testsFailed++;

if (runTest('StringField: Max length validation', () => {
  const field = new StringField({ maxLength: 5 });
  field.validate('abc');
  assertThrows(() => field.validate('abcdef'), ValidationError);
})) testsPassed++; else testsFailed++;

if (runTest('StringField: Min length validation', () => {
  const field = new StringField({ minLength: 3 });
  field.validate('abc');
  assertThrows(() => field.validate('ab'), ValidationError);
})) testsPassed++; else testsFailed++;

if (runTest('StringField: Pattern validation', () => {
  const field = new StringField({ pattern: /^[a-z]+$/ });
  field.validate('abc');
  assertThrows(() => field.validate('ABC'), ValidationError);
})) testsPassed++; else testsFailed++;

if (runTest('StringField: Trim option', () => {
  const field = new StringField({ trim: true });
  field.validate('  hello  ');
})) testsPassed++; else testsFailed++;

// Test: CharField
if (runTest('CharField: Default maxLength', () => {
  const field = new CharField();
  assertEqual(field.maxLength, 255);
  assertEqual(field.dbType, 'VARCHAR(255)');
})) testsPassed++; else testsFailed++;

// Test: TextField
if (runTest('TextField: Basic creation', () => {
  const field = new TextField();
  assertEqual(field.dbType, 'TEXT');
})) testsPassed++; else testsFailed++;

if (runTest('TextField: Medium variant', () => {
  const field = new TextField({ medium: true });
  assertEqual(field.dbType, 'MEDIUMTEXT');
})) testsPassed++; else testsFailed++;

if (runTest('TextField: Long variant', () => {
  const field = new TextField({ long: true });
  assertEqual(field.dbType, 'LONGTEXT');
})) testsPassed++; else testsFailed++;

// Test: EmailField
if (runTest('EmailField: Email validation', () => {
  const field = new EmailField();
  field.validate('test@example.com');
  assertThrows(() => field.validate('invalid-email'), ValidationError);
})) testsPassed++; else testsFailed++;

// Test: SlugField
if (runTest('SlugField: Slug validation', () => {
  const field = new SlugField();
  field.validate('my-blog-post');
  field.validate('another-post-123');
  assertThrows(() => field.validate('Invalid Slug!'), ValidationError);
})) testsPassed++; else testsFailed++;

// Test: URLField
if (runTest('URLField: URL validation', () => {
  const field = new URLField();
  field.validate('https://example.com');
  field.validate('http://example.com');
  assertThrows(() => field.validate('not-a-url'), ValidationError);
})) testsPassed++; else testsFailed++;

// Test: UUIDField
if (runTest('UUIDField: UUID validation', () => {
  const field = new UUIDField();
  field.validate('550e8400-e29b-41d4-a716-446655440000');
  assertThrows(() => field.validate('not-a-uuid'), ValidationError);
})) testsPassed++; else testsFailed++;

if (runTest('UUIDField: Default generation', () => {
  const field = new UUIDField();
  const defaultValue = typeof field.default === 'function' ? field.default() : field.default;
  assertEqual(typeof defaultValue, 'string');
})) testsPassed++; else testsFailed++;

// Test: DecimalField
if (runTest('DecimalField: Precision and scale', () => {
  const field = new DecimalField({ precision: 10, scale: 2 });
  assertEqual(field.precision, 10);
  assertEqual(field.scale, 2);
  assertEqual(field.dbType, 'DECIMAL(10,2)');
})) testsPassed++; else testsFailed++;

if (runTest('DecimalField: Validation', () => {
  const field = new DecimalField({ precision: 5, scale: 2 });
  field.validate(123.45);
  assertThrows(() => field.validate('string'), ValidationError);
})) testsPassed++; else testsFailed++;

// Test: FloatField
if (runTest('FloatField: Basic creation', () => {
  const field = new FloatField();
  assertEqual(field.dbType, 'FLOAT');
})) testsPassed++; else testsFailed++;

if (runTest('FloatField: Min/max validation', () => {
  const field = new FloatField({ min: 0, max: 100 });
  field.validate(50.5);
  assertThrows(() => field.validate(-1), ValidationError);
  assertThrows(() => field.validate(101), ValidationError);
})) testsPassed++; else testsFailed++;

// Test: BooleanField
if (runTest('BooleanField: Basic creation', () => {
  const field = new BooleanField();
  assertEqual(field.dbType, 'BOOLEAN');
})) testsPassed++; else testsFailed++;

if (runTest('BooleanField: Boolean validation', () => {
  const field = new BooleanField();
  field.validate(true);
  field.validate(false);
  field.validate(1);
  field.validate(0);
})) testsPassed++; else testsFailed++;

if (runTest('BooleanField: fromDatabase conversion', () => {
  const field = new BooleanField();
  assertEqual(field.fromDatabase(true), true);
  assertEqual(field.fromDatabase('t'), true);
  assertEqual(field.fromDatabase('f'), false);
})) testsPassed++; else testsFailed++;

// Test: DateField
if (runTest('DateField: Basic creation', () => {
  const field = new DateField();
  assertEqual(field.dbType, 'DATE');
})) testsPassed++; else testsFailed++;

if (runTest('DateField: prepareValue', () => {
  const field = new DateField();
  const date = new Date('2024-01-15');
  assertEqual(field.prepareValue(date), '2024-01-15');
})) testsPassed++; else testsFailed++;

// Test: TimeField
if (runTest('TimeField: Basic creation', () => {
  const field = new TimeField();
  assertEqual(field.dbType, 'TIME');
})) testsPassed++; else testsFailed++;

// Test: DateTimeField
if (runTest('DateTimeField: Basic creation', () => {
  const field = new DateTimeField();
  assertEqual(field.dbType, 'TIMESTAMP');
})) testsPassed++; else testsFailed++;

if (runTest('DateTimeField: Timezone support', () => {
  const field = new DateTimeField({ timezone: 'America/New_York', useTz: true });
  assertEqual(field.timezone, 'America/New_York');
  assertEqual(field.useTz, true);
  assertEqual(field.dbType, 'TIMESTAMPTZ');
})) testsPassed++; else testsFailed++;

if (runTest('DateTimeField: Auto timestamps', () => {
  const field = new DateTimeField({ autoNow: true });
  assertEqual(field.autoNow, true);
  
  const field2 = new DateTimeField({ autoNowAdd: true });
  assertEqual(field2.autoNowAdd, true);
})) testsPassed++; else testsFailed++;

// Test: EnumField
if (runTest('EnumField: Basic creation', () => {
  const field = new EnumField({ values: ['active', 'inactive', 'pending'] });
  assertEqual(field.values.length, 3);
  assertEqual(field.dbType.includes('ENUM'), true);
})) testsPassed++; else testsFailed++;

if (runTest('EnumField: Value validation', () => {
  const field = new EnumField({ values: ['active', 'inactive'] });
  field.validate('active');
  assertThrows(() => field.validate('unknown'), ValidationError);
})) testsPassed++; else testsFailed++;

if (runTest('EnumField: Requires values array', () => {
  assertThrows(() => new EnumField({}), UltraORMError);
})) testsPassed++; else testsFailed++;

// Test: JSONField
if (runTest('JSONField: Basic creation', () => {
  const field = new JSONField();
  assertEqual(field.dbType, 'JSON');
})) testsPassed++; else testsFailed++;

if (runTest('JSONField: JSON validation', () => {
  const field = new JSONField();
  field.validate({ key: 'value' });
  field.validate([1, 2, 3]);
  assertThrows(() => field.validate('not-json'), ValidationError);
})) testsPassed++; else testsFailed++;

if (runTest('JSONField: prepareValue and fromDatabase', () => {
  const field = new JSONField();
  const obj = { key: 'value' };
  assertEqual(field.prepareValue(obj), JSON.stringify(obj));
  assertEqual(field.fromDatabase('{"key":"value"}').key, 'value');
})) testsPassed++; else testsFailed++;

// Test: ForeignKey
if (runTest('ForeignKey: Basic creation', () => {
  const field = new ForeignKey(Model);
  assertEqual(field.onDelete, 'CASCADE');
  assertEqual(field.onUpdate, 'CASCADE');
  assertEqual(field.nullable, false);
})) testsPassed++; else testsFailed++;

if (runTest('ForeignKey: SQL definition', () => {
  const field = new ForeignKey(Model, { nullable: true });
  const sql = field.getSQLDefinition('user_id');
  assertEqual(sql.includes('user_id'), true);
})) testsPassed++; else testsFailed++;

// Test: OneToOneField
if (runTest('OneToOneField: Unique constraint', () => {
  const field = new OneToOneField(Model);
  assertEqual(field.unique, true);
})) testsPassed++; else testsFailed++;

// Test: Field SQL generation
if (runTest('Field: SQL definition for MySQL', () => {
  const field = new IntegerField({ primaryKey: true, autoIncrement: true });
  const sql = field.getSQLDefinition('id', 'mysql');
  assertEqual(sql.includes('AUTO_INCREMENT'), true);
})) testsPassed++; else testsFailed++;

if (runTest('Field: SQL definition for PostgreSQL', () => {
  const field = new IntegerField({ primaryKey: true, autoIncrement: true });
  const sql = field.getSQLDefinition('id', 'postgres');
  assertEqual(sql.includes('SERIAL'), true);
})) testsPassed++; else testsFailed++;

if (runTest('Field: Default value in SQL', () => {
  const field = new StringField({ default: 'hello' });
  const sql = field.getSQLDefinition('name');
  assertEqual(sql.includes("DEFAULT 'hello'"), true);
})) testsPassed++; else testsFailed++;

// ==================== QUERY OPERATOR TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - QUERY OPERATOR TESTS');
console.log('='.repeat(60) + '\n');

// Test: Query operators exist
if (runTest('QUERY_OPERATORS: All operators defined', () => {
  const requiredOps = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$notIn', '$isNull', '$isNotNull', '$like', '$notLike', '$between', '$notBetween', '$contains', '$startsWith', '$endsWith'];
  for (const op of requiredOps) {
    assertEqual(typeof QUERY_OPERATORS[op], 'function', `Missing operator: ${op}`);
  }
})) testsPassed++; else testsFailed++;

// Test: $eq operator
if (runTest('QUERY_OPERATORS: $eq operator', () => {
  const result = QUERY_OPERATORS.$eq('age', 18);
  assertEqual(result.clause, 'age = ?');
  assertEqual(result.value, 18);
})) testsPassed++; else testsFailed++;

// Test: $ne operator
if (runTest('QUERY_OPERATORS: $ne operator', () => {
  const result = QUERY_OPERATORS.$ne('status', 'deleted');
  assertEqual(result.clause, 'status != ?');
})) testsPassed++; else testsFailed++;

// Test: $gt, $gte, $lt, $lte operators
if (runTest('QUERY_OPERATORS: Comparison operators', () => {
  assertEqual(QUERY_OPERATORS.$gt('age', 18).clause, 'age > ?');
  assertEqual(QUERY_OPERATORS.$gte('age', 18).clause, 'age >= ?');
  assertEqual(QUERY_OPERATORS.$lt('age', 65).clause, 'age < ?');
  assertEqual(QUERY_OPERATORS.$lte('age', 65).clause, 'age <= ?');
})) testsPassed++; else testsFailed++;

// Test: $in operator
if (runTest('QUERY_OPERATORS: $in operator', () => {
  const result = QUERY_OPERATORS.$in('status', ['active', 'pending']);
  assertEqual(result.clause, 'status IN (?,?)');
  assertEqual(result.value.length, 2);
})) testsPassed++; else testsFailed++;

// Test: $notIn operator
if (runTest('QUERY_OPERATORS: $notIn operator', () => {
  const result = QUERY_OPERATORS.$notIn('status', ['deleted', 'archived']);
  assertEqual(result.clause, 'status NOT IN (?,?)');
})) testsPassed++; else testsFailed++;

// Test: $isNull operator
if (runTest('QUERY_OPERATORS: $isNull operator', () => {
  const result = QUERY_OPERATORS.$isNull('deleted_at');
  assertEqual(result.clause, 'deleted_at IS NULL');
})) testsPassed++; else testsFailed++;

// Test: $isNotNull operator
if (runTest('QUERY_OPERATORS: $isNotNull operator', () => {
  const result = QUERY_OPERATORS.$isNotNull('confirmed_at');
  assertEqual(result.clause, 'confirmed_at IS NOT NULL');
})) testsPassed++; else testsFailed++;

// Test: $like operator
if (runTest('QUERY_OPERATORS: $like operator', () => {
  const result = QUERY_OPERATORS.$like('name', '%John%');
  assertEqual(result.clause, 'name LIKE ?');
})) testsPassed++; else testsFailed++;

// Test: $between operator
if (runTest('QUERY_OPERATORS: $between operator', () => {
  const result = QUERY_OPERATORS.$between('age', [18, 65]);
  assertEqual(result.clause, 'age BETWEEN ? AND ?');
  assertEqual(result.value.length, 2);
})) testsPassed++; else testsFailed++;

// Test: $between validation
if (runTest('QUERY_OPERATORS: $between requires array', () => {
  assertThrows(() => QUERY_OPERATORS.$between('age', 'invalid'), ValidationError);
})) testsPassed++; else testsFailed++;

// Test: $contains operator
if (runTest('QUERY_OPERATORS: $contains operator', () => {
  const result = QUERY_OPERATORS.$contains('name', 'John');
  assertEqual(result.value, '%John%');
})) testsPassed++; else testsFailed++;

// Test: $startsWith operator
if (runTest('QUERY_OPERATORS: $startsWith operator', () => {
  const result = QUERY_OPERATORS.$startsWith('name', 'J');
  assertEqual(result.value, 'J%');
})) testsPassed++; else testsFailed++;

// Test: $endsWith operator
if (runTest('QUERY_OPERATORS: $endsWith operator', () => {
  const result = QUERY_OPERATORS.$endsWith('email', '.com');
  assertEqual(result.value, '%.com');
})) testsPassed++; else testsFailed++;

// ==================== UTILITY FUNCTION TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - UTILITY FUNCTION TESTS');
console.log('='.repeat(60) + '\n');

if (runTest('toSnakeCase: Basic conversion', () => {
  assertEqual(toSnakeCase('helloWorld'), 'hello_world');
  assertEqual(toSnakeCase('HelloWorld'), 'hello_world');
  assertEqual(toSnakeCase('HTMLParser'), 'h_t_m_l_parser');
})) testsPassed++; else testsFailed++;

if (runTest('toCamelCase: Basic conversion', () => {
  assertEqual(toCamelCase('hello_world'), 'helloWorld');
  assertEqual(toCamelCase('user_id'), 'userId');
  assertEqual(toCamelCase('hello_world_greeting'), 'helloWorldGreeting');
})) testsPassed++; else testsFailed++;

if (runTest('deepClone: Object cloning', () => {
  const original = { a: 1, b: { c: 2 }, d: [1, 2, 3] };
  const cloned = deepClone(original);
  cloned.b.c = 99;
  cloned.d.push(4);
  assertEqual(original.b.c, 2);
  assertEqual(original.d.length, 3);
  assertEqual(cloned.b.c, 99);
  assertEqual(cloned.d.length, 4);
})) testsPassed++; else testsFailed++;

if (runTest('deepClone: Array cloning', () => {
  const original = [1, [2, 3], { a: 4 }];
  const cloned = deepClone(original);
  cloned[1].push(99);
  cloned[2].a = 88;
  assertEqual(original[1].length, 2);
  assertEqual(original[2].a, 4);
})) testsPassed++; else testsFailed++;

if (runTest('deepClone: Special types', () => {
  const date = new Date('2024-01-15');
  const cloned = deepClone(date);
  assertEqual(cloned instanceof Date, true);
  assertEqual(cloned.getTime(), date.getTime());
})) testsPassed++; else testsFailed++;

// ==================== MODEL TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - MODEL TESTS');
console.log('='.repeat(60) + '\n');

// Create test models
class TestUser extends Model {
  static tableName = 'users';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField({ maxLength: 100, nullable: false }),
    email: new EmailField({ unique: true, nullable: false }),
    age: new IntegerField({ min: 0, max: 150, nullable: true }),
    isActive: new BooleanField({ default: true }),
    createdAt: new DateTimeField({ autoNowAdd: true }),
    updatedAt: new DateTimeField({ autoNow: true }),
    data: new JSONField({ nullable: true }),
    status: new EnumField({ values: ['active', 'inactive', 'pending'] })
  };
}

// Test: Model field definitions
if (runTest('Model: Static field definitions', () => {
  assertEqual(TestUser.fields.id instanceof IntegerField, true);
  assertEqual(TestUser.fields.name instanceof StringField, true);
  assertEqual(TestUser.fields.email instanceof EmailField, true);
  assertEqual(TestUser.fields.isActive instanceof BooleanField, true);
  assertEqual(TestUser.fields.data instanceof JSONField, true);
  assertEqual(TestUser.fields.status instanceof EnumField, true);
})) testsPassed++; else testsFailed++;

// Test: Model primary key
if (runTest('Model: Primary key detection', () => {
  assertEqual(TestUser.primaryKeyName, 'id');
})) testsPassed++; else testsFailed++;

// Test: Model instance creation
if (runTest('Model: Instance creation with data', () => {
  const user = new TestUser({
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  });
  assertEqual(user.data.name, 'John Doe');
  assertEqual(user.data.email, 'john@example.com');
  assertEqual(user.data.age, 30);
  assertEqual(user.data.isActive, true); // Default value
  assertEqual(user.isNew, true);
})) testsPassed++; else testsFailed++;

// Test: Model instance default values
if (runTest('Model: Default values', () => {
  const user = new TestUser({
    name: 'Jane',
    email: 'jane@example.com'
  });
  assertEqual(user.data.isActive, true);
  assertEqual(user.data.age, null);
})) testsPassed++; else testsFailed++;

// Test: Model set method
if (runTest('Model: Set field value', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  user.set('name', 'Johnny');
  assertEqual(user.data.name, 'Johnny');
  assertEqual(user._changes.has('name'), true);
})) testsPassed++; else testsFailed++;

if (runTest('Model: Set unknown field throws', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  assertThrows(() => user.set('unknownField', 'value'), UltraORMError);
})) testsPassed++; else testsFailed++;

// Test: Model get method
if (runTest('Model: Get field value', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  assertEqual(user.get('name'), 'John');
  assertEqual(user.get('email'), 'john@example.com');
})) testsPassed++; else testsFailed++;

// Test: Model validation
if (runTest('Model: Validate method', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  user.validate(); // Should not throw
})) testsPassed++; else testsFailed++;

if (runTest('Model: Validate throws on invalid', () => {
  const user = new TestUser({
    name: 'John',
    email: 'invalid-email' // Invalid email
  });
  assertThrows(() => user.validate(), ValidationError);
})) testsPassed++; else testsFailed++;

// Test: Model fill method
if (runTest('Model: Fill method', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  user.fill({
    name: 'Jane',
    age: 25
  });
  assertEqual(user.data.name, 'Jane');
  assertEqual(user.data.age, 25);
})) testsPassed++; else testsFailed++;

if (runTest('Model: Fill ignores unknown fields', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  user.fill({
    unknown: 'value'
  });
  assertEqual(user.data.unknown, undefined);
})) testsPassed++; else testsFailed++;

// Test: Model merge method
if (runTest('Model: Merge method', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  user.merge({
    name: 'Jane',
    age: 25
  });
  assertEqual(user.data.name, 'Jane');
  assertEqual(user.data.age, 25);
})) testsPassed++; else testsFailed++;

// Test: Model toJSON method
if (runTest('Model: toJSON method', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  const json = user.toJSON();
  assertEqual(typeof json, 'object');
  assertEqual(json.name, 'John');
  assertEqual(json.email, 'john@example.com');
})) testsPassed++; else testsFailed++;

// Test: Model isDirty method
if (runTest('Model: isDirty method', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  assertEqual(user.isDirty(), false); // All set during construction
  
  user.set('name', 'Jane');
  assertEqual(user.isDirty(), true);
})) testsPassed++; else testsFailed++;

// Test: Model getChanged method
if (runTest('Model: getChanged method', () => {
  const user = new TestUser({
    name: 'John',
    email: 'john@example.com'
  });
  user.set('name', 'Jane');
  user.set('age', 25);
  
  const changed = user.getChanged();
  assertEqual(changed.includes('name'), true);
  assertEqual(changed.includes('age'), true);
})) testsPassed++; else testsFailed++;

// ==================== QUERYSET TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - QUERYSET TESTS');
console.log('='.repeat(60) + '\n');

// Test: QuerySet creation
if (runTest('QuerySet: Basic creation', () => {
  const qs = TestUser.query();
  assertEqual(qs instanceof QuerySet, true);
  assertEqual(qs.model, TestUser);
})) testsPassed++; else testsFailed++;

// Test: QuerySet chaining
if (runTest('QuerySet: Method chaining', () => {
  const qs = TestUser.query()
    .where({ status: 'active' })
    .order('name', 'DESC')
    .take(10);
  
  assertEqual(qs._whereConditions.length, 1);
  assertEqual(qs._orderBy.length, 1);
  assertEqual(qs._limit, 10);
})) testsPassed++; else testsFailed++;

// Test: where method
if (runTest('QuerySet: where method', () => {
  const qs = TestUser.query().where({ status: 'active', age: { $gt: 18 } });
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: where with string condition
if (runTest('QuerySet: where with string condition', () => {
  const qs = TestUser.query().where('name', 'John');
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: where with operator
if (runTest('QuerySet: where with operator', () => {
  const qs = TestUser.query().where('age', '>', 18);
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: orWhere method
if (runTest('QuerySet: orWhere method', () => {
  const qs = TestUser.query()
    .where({ status: 'active' })
    .orWhere({ role: 'admin' });
  
  assertEqual(qs._orConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereIn method
if (runTest('QuerySet: whereIn method', () => {
  const qs = TestUser.query().whereIn('id', [1, 2, 3]);
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereNotIn method
if (runTest('QuerySet: whereNotIn method', () => {
  const qs = TestUser.query().whereNotIn('status', ['deleted', 'archived']);
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereNull method
if (runTest('QuerySet: whereNull method', () => {
  const qs = TestUser.query().whereNull('deletedAt');
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereNotNull method
if (runTest('QuerySet: whereNotNull method', () => {
  const qs = TestUser.query().whereNotNull('confirmedAt');
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereBetween method
if (runTest('QuerySet: whereBetween method', () => {
  const qs = TestUser.query().whereBetween('age', [18, 65]);
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereNotBetween method
if (runTest('QuerySet: whereNotBetween method', () => {
  const qs = TestUser.query().whereNotBetween('price', [100, 500]);
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereLike method
if (runTest('QuerySet: whereLike method', () => {
  const qs = TestUser.query().whereLike('name', '%John%');
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: whereNotLike method
if (runTest('QuerySet: whereNotLike method', () => {
  const qs = TestUser.query().whereNotLike('email', '%@spam.com');
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: search method
if (runTest('QuerySet: search method', () => {
  const qs = TestUser.query().search('name', 'John');
  assertEqual(qs._whereConditions.length, 1);
})) testsPassed++; else testsFailed++;

// Test: order method
if (runTest('QuerySet: order method', () => {
  const qs = TestUser.query().order('createdAt', 'DESC');
  assertEqual(qs._orderBy.length, 1);
  assertEqual(qs._orderBy[0], 'createdAt DESC');
})) testsPassed++; else testsFailed++;

// Test: order with shorthand
if (runTest('QuerySet: order with - prefix', () => {
  const qs = TestUser.query().order('-createdAt');
  assertEqual(qs._orderBy[0], 'createdAt DESC');
})) testsPassed++; else testsFailed++;

// Test: limit method
if (runTest('QuerySet: limit method', () => {
  const qs = TestUser.query().limit(10);
  assertEqual(qs._limit, 10);
})) testsPassed++; else testsFailed++;

// Test: take method (alias)
if (runTest('QuerySet: take method', () => {
  const qs = TestUser.query().take(10);
  assertEqual(qs._limit, 10);
})) testsPassed++; else testsFailed++;

// Test: offset method
if (runTest('QuerySet: offset method', () => {
  const qs = TestUser.query().offset(20);
  assertEqual(qs._offset, 20);
})) testsPassed++; else testsFailed++;

// Test: skip method (alias)
if (runTest('QuerySet: skip method', () => {
  const qs = TestUser.query().skip(20);
  assertEqual(qs._offset, 20);
})) testsPassed++; else testsFailed++;

// Test: include method
if (runTest('QuerySet: include method', () => {
  const qs = TestUser.query().include('posts');
  assertEqual(qs._includes.length, 1);
})) testsPassed++; else testsFailed++;

// Test: include with array
if (runTest('QuerySet: include with array', () => {
  const qs = TestUser.query().include(['posts', 'comments', 'author']);
  assertEqual(qs._includes.length, 3);
})) testsPassed++; else testsFailed++;

// Test: with method (alias)
if (runTest('QuerySet: with method', () => {
  const qs = TestUser.query().with('posts');
  assertEqual(qs._includes.length, 1);
})) testsPassed++; else testsFailed++;

// Test: select method
if (runTest('QuerySet: select method', () => {
  const qs = TestUser.query().select('id', 'name', 'email');
  assertEqual(qs._selectFields.length, 3);
})) testsPassed++; else testsFailed++;

// Test: distinct method
if (runTest('QuerySet: distinct method', () => {
  const qs = TestUser.query().distinct();
  assertEqual(qs._distinct, true);
})) testsPassed++; else testsFailed++;

// Test: distinct with field
if (runTest('QuerySet: distinct with field', () => {
  const qs = TestUser.query().distinct('status');
  assertEqual(qs._distinct, true);
  assertEqual(qs._selectFields[0], 'status');
})) testsPassed++; else testsFailed++;

// Test: groupBy method
if (runTest('QuerySet: groupBy method', () => {
  const qs = TestUser.query().groupBy('status');
  assertEqual(qs._groupBy.length, 1);
})) testsPassed++; else testsFailed++;

// Test: groupBy with array
if (runTest('QuerySet: groupBy with array', () => {
  const qs = TestUser.query().groupBy(['status', 'role']);
  assertEqual(qs._groupBy.length, 2);
})) testsPassed++; else testsFailed++;

// Test: having method
if (runTest('QuerySet: having method', () => {
  const qs = TestUser.query().having('COUNT(*) > 5');
  assertEqual(qs._having.length, 1);
})) testsPassed++; else testsFailed++;

// Test: forUpdate method
if (runTest('QuerySet: forUpdate method', () => {
  const qs = TestUser.query().forUpdate();
  assertEqual(qs._forUpdate, true);
})) testsPassed++; else testsFailed++;

// Test: lockInShareMode method
if (runTest('QuerySet: lockInShareMode method', () => {
  const qs = TestUser.query().lockInShareMode();
  assertEqual(qs._lockInShareMode, true);
})) testsPassed++; else testsFailed++;

// ==================== ULTRAORM TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - ULTRAORM CLASS TESTS');
console.log('='.repeat(60) + '\n');

// Test: UltraORM instantiation
if (runTest('UltraORM: Singleton pattern', () => {
  // Reset singleton
  UltraORM.instance = null;
  
  const orm1 = new UltraORM({ type: 'postgres' });
  const orm2 = new UltraORM({ type: 'mysql' }); // Should return same instance
  
  assertEqual(orm1, orm2);
  
  // Reset for other tests
  UltraORM.instance = null;
})) testsPassed++; else testsFailed++;

// Test: Model registration
if (runTest('UltraORM: Model registration', () => {
  UltraORM.instance = null;
  const orm = new UltraORM({ type: 'postgres' });
  
  orm.registerModel(TestUser);
  
  assertEqual(orm.models.size, 1);
  assertEqual(orm.models.get('users'), TestUser);
  assertEqual(orm.TestUser, TestUser);
  assertEqual(orm.testUser, TestUser);
  
  UltraORM.instance = null;
})) testsPassed++; else testsFailed++;

// Test: Model access via model()
if (runTest('UltraORM: model() method', () => {
  UltraORM.instance = null;
  const orm = new UltraORM({ type: 'postgres' });
  orm.registerModel(TestUser);
  
  assertEqual(orm.model('users'), TestUser);
  
  UltraORM.instance = null;
})) testsPassed++; else testsFailed++;

// Test: raw expression
if (runTest('UltraORM: raw() method', () => {
  UltraORM.instance = null;
  const orm = new UltraORM({ type: 'postgres' });
  const raw = orm.raw('NOW()');
  assertEqual(raw.__ultraRaw, 'NOW()');
  UltraORM.instance = null;
})) testsPassed++; else testsFailed++;

// ==================== ERROR CLASS TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - ERROR CLASS TESTS');
console.log('='.repeat(60) + '\n');

if (runTest('UltraORMError: Basic error', () => {
  const error = new UltraORMError('Test error');
  assertEqual(error.name, 'UltraORMError');
  assertEqual(error.code, 'ULTRAORM_ERROR');
  assertEqual(error.message, 'Test error');
})) testsPassed++; else testsFailed++;

if (runTest('ValidationError: With field', () => {
  const field = new StringField();
  const error = new ValidationError('Invalid value', field);
  assertEqual(error.name, 'ValidationError');
  assertEqual(error.code, 'VALIDATION_ERROR');
  assertEqual(error.field, field);
})) testsPassed++; else testsFailed++;

if (runTest('NotFoundError: With model', () => {
  const error = new NotFoundError('User not found', 'users');
  assertEqual(error.name, 'NotFoundError');
  assertEqual(error.code, 'NOT_FOUND');
  assertEqual(error.model, 'users');
})) testsPassed++; else testsFailed++;

// ==================== RELATIONSHIP DEFINITION TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ULTRAORM - RELATIONSHIP TESTS');
console.log('='.repeat(60) + '\n');

class TestPost extends Model {
  static tableName = 'posts';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    userId: new ForeignKey(TestUser, { nullable: false }),
    title: new StringField(),
    content: new TextField()
  };
}

class TestProfile extends Model {
  static tableName = 'profiles';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    userId: new ForeignKey(TestUser, { nullable: false }),
    bio: new TextField()
  };
}

class TestRole extends Model {
  static tableName = 'roles';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    name: new StringField()
  };
}

class TestUserRole extends Model {
  static tableName = 'user_roles';
  static fields = {
    id: new IntegerField({ primaryKey: true, autoIncrement: true }),
    userId: new ForeignKey(TestUser),
    roleId: new ForeignKey(TestRole)
  };
}

// Test: belongsTo relationship
if (runTest('Relationship: belongsTo definition', () => {
  TestPost.belongsTo(TestUser, { foreignKey: 'userId', as: 'author' });
  
  assertEqual(TestPost.associations.author.type, 'belongsTo');
  assertEqual(TestPost.associations.author.target, TestUser);
  assertEqual(TestPost.associations.author.foreignKey, 'userId');
})) testsPassed++; else testsFailed++;

// Test: hasMany relationship
if (runTest('Relationship: hasMany definition', () => {
  TestUser.hasMany(TestPost, { foreignKey: 'userId', as: 'posts' });
  
  assertEqual(TestUser.associations.posts.type, 'hasMany');
  assertEqual(TestUser.associations.posts.target, TestPost);
  assertEqual(TestUser.associations.posts.foreignKey, 'userId');
})) testsPassed++; else testsFailed++;

// Test: hasOne relationship
if (runTest('Relationship: hasOne definition', () => {
  TestUser.hasOne(TestProfile, { foreignKey: 'userId', as: 'profile' });
  
  assertEqual(TestUser.associations.profile.type, 'hasOne');
  assertEqual(TestUser.associations.profile.target, TestProfile);
})) testsPassed++; else testsFailed++;

// Test: belongsToMany relationship
if (runTest('Relationship: belongsToMany definition', () => {
  TestUser.belongsToMany(TestRole, { through: TestUserRole, as: 'roles' });
  
  assertEqual(TestUser.associations.roles.type, 'belongsToMany');
  assertEqual(TestUser.associations.roles.target, TestRole);
  assertEqual(TestUser.associations.roles.through, TestUserRole);
})) testsPassed++; else testsFailed++;

// Test: belongsToMany requires through
if (runTest('Relationship: belongsToMany requires through', () => {
  assertThrows(() => {
    TestUser.belongsToMany(TestRole);
  }, UltraORMError);
})) testsPassed++; else testsFailed++;

// Test: belongsToSelf relationship
if (runTest('Relationship: belongsToSelf definition', () => {
  class TestCategory extends Model {
    static tableName = 'categories';
    static fields = {
      id: new IntegerField({ primaryKey: true }),
      name: new StringField(),
      parentId: new IntegerField({ nullable: true })
    };
  }
  
  TestCategory.belongsToSelf({ as: 'parent', childrenAs: 'children' });
  
  assertEqual(TestCategory.associations.parent.type, 'belongsTo');
  assertEqual(TestCategory.associations.children.type, 'hasMany');
})) testsPassed++; else testsFailed++;

// Test: morphMany relationship
if (runTest('Relationship: morphMany definition', () => {
  class TestComment extends Model {
    static tableName = 'comments';
    static fields = {
      id: new IntegerField({ primaryKey: true }),
      content: new TextField(),
      commentableType: new StringField(),
      commentableId: new IntegerField()
    };
  }
  
  TestPost.morphMany(TestComment, { morphName: 'commentable', as: 'comments' });
  
  assertEqual(TestPost.associations.comments.type, 'morphMany');
  assertEqual(TestPost.associations.comments.morphType, 'commentable_type');
  assertEqual(TestPost.associations.comments.morphId, 'commentable_id');
})) testsPassed++; else testsFailed++;

// Test: morphOne relationship
if (runTest('Relationship: morphOne definition', () => {
  class TestImage extends Model {
    static tableName = 'images';
    static fields = {
      id: new IntegerField({ primaryKey: true }),
      url: new StringField(),
      imageableType: new StringField(),
      imageableId: new IntegerField()
    };
  }
  
  TestPost.morphOne(TestImage, { morphName: 'imageable', as: 'image' });
  
  assertEqual(TestPost.associations.image.type, 'morphOne');
})) testsPassed++; else testsFailed++;

// Test: morphTo relationship
if (runTest('Relationship: morphTo definition', () => {
  class TestComment extends Model {
    static tableName = 'comments';
    static fields = {
      id: new IntegerField({ primaryKey: true }),
      content: new TextField(),
      commentableType: new StringField(),
      commentableId: new IntegerField()
    };
  }
  
  TestComment.morphTo({ as: 'commentable' });
  
  assertEqual(TestComment.associations.commentable.type, 'morphTo');
  assertEqual(TestComment.associations.commentable.morphType, 'commentable_type');
  assertEqual(TestComment.associations.commentable.morphId, 'commentable_id');
})) testsPassed++; else testsFailed++;

// ==================== TEST SUMMARY ====================

console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total tests: ${testsPassed + testsFailed}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log('='.repeat(60) + '\n');

// Exit with error code if any tests failed
process.exit(testsFailed > 0 ? 1 : 0);
