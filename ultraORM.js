//by LightOne Dev
// ultra-orm.js
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

// ==================== FIELD TYPES ====================
class Field {
  constructor(options = {}) {
    this.primaryKey = options.primaryKey || false;
    this.unique = options.unique || false;
    this.nullable = options.nullable ?? true;
    this.default = options.default;
    this.autoIncrement = options.autoIncrement || false;
    this.validators = options.validators || [];
    this.dbType = options.dbType;
  }

  validate(value) {
    if (!this.nullable && (value === null || value === undefined)) {
      throw new Error('Field cannot be null');
    }
    
    for (const validator of this.validators) {
      validator(value);
    }
    return true;
  }

  getSQLDefinition(fieldName) {
    let definition = `${fieldName} ${this.dbType}`;
    
    if (this.primaryKey) definition += ' PRIMARY KEY';
    if (this.autoIncrement) definition += ' AUTO_INCREMENT';
    if (!this.nullable) definition += ' NOT NULL';
    if (this.unique) definition += ' UNIQUE';
    if (this.default !== undefined) {
      const defaultValue = typeof this.default === 'function' ? this.default() : this.default;
      definition += ` DEFAULT ${defaultValue}`;
    }
    
    return definition;
  }
}

class IntegerField extends Field {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.dbType = options.dbType || 'INT';
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error('Must be an integer');
      }
      if (this.min !== undefined && value < this.min) {
        throw new Error(`Must be at least ${this.min}`);
      }
      if (this.max !== undefined && value > this.max) {
        throw new Error(`Must be at most ${this.max}`);
      }
    }
  }
}

class BigIntegerField extends IntegerField {
  constructor(options = {}) {
    super(options);
    this.dbType = 'BIGINT';
  }
}

class StringField extends Field {
  constructor(options = {}) {
    super(options);
    this.maxLength = options.maxLength;
    this.minLength = options.minLength;
    this.pattern = options.pattern;
    this.dbType = this.maxLength ? `VARCHAR(${this.maxLength})` : 'TEXT';
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined) {
      if (typeof value !== 'string') {
        throw new Error('Must be a string');
      }
      if (this.maxLength && value.length > this.maxLength) {
        throw new Error(`Maximum length exceeded: ${this.maxLength}`);
      }
      if (this.minLength && value.length < this.minLength) {
        throw new Error(`Minimum length required: ${this.minLength}`);
      }
      if (this.pattern && !this.pattern.test(value)) {
        throw new Error('Pattern validation failed');
      }
    }
  }
}

class EmailField extends StringField {
  constructor(options = {}) {
    super({
      ...options,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      maxLength: options.maxLength || 255
    });
  }
}

class DateTimeField extends Field {
  constructor(options = {}) {
    super(options);
    this.autoNow = options.autoNow || false;
    this.autoNowAdd = options.autoNowAdd || false;
    this.dbType = 'TIMESTAMP';
  }

  getSQLDefinition(fieldName) {
    let definition = super.getSQLDefinition(fieldName);
    if (this.autoNowAdd) {
      definition += ' DEFAULT CURRENT_TIMESTAMP';
    }
    return definition;
  }
}

class BooleanField extends Field {
  constructor(options = {}) {
    super(options);
    this.dbType = 'BOOLEAN';
  }

  validate(value) {
    super.validate(value);
    if (value !== null && value !== undefined && typeof value !== 'boolean') {
      throw new Error('Must be a boolean');
    }
  }
}

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
        throw new Error('Must be valid JSON');
      }
    }
  }
}

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
        throw new Error('Must be a number');
      }
      if (this.min !== undefined && value < this.min) {
        throw new Error(`Must be at least ${this.min}`);
      }
      if (this.max !== undefined && value > this.max) {
        throw new Error(`Must be at most ${this.max}`);
      }
    }
  }
}

class ForeignKey {
  constructor(model, options = {}) {
    this.model = model;
    this.onDelete = options.onDelete || 'CASCADE';
    this.onUpdate = options.onUpdate || 'CASCADE';
    this.dbType = 'INT';
    this.nullable = options.nullable ?? false;
  }

  getSQLDefinition(fieldName) {
    return `${fieldName} INT ${this.nullable ? 'NULL' : 'NOT NULL'}`;
  }

  getForeignKeySQL(tableName, fieldName) {
    const referencedTable = this.model.tableName;
    return `FOREIGN KEY (${fieldName}) REFERENCES ${referencedTable}(id) ON DELETE ${this.onDelete} ON UPDATE ${this.onUpdate}`;
  }
}

// ==================== QUERY SET ====================
class QuerySet {
  constructor(model) {
    this.model = model;
    this.whereConditions = [];
    this.orderBy = [];
    this.limit = null;
    this.offset = null;
    this.includes = [];
    this.selectFields = ['*'];
  }

  where(conditions) {
    this.whereConditions.push(conditions);
    return this;
  }

  order(field, direction = 'ASC') {
    this.orderBy.push(`${field} ${direction}`);
    return this;
  }

  take(limit) {
    this.limit = limit;
    return this;
  }

  skip(offset) {
    this.offset = offset;
    return this;
  }

  include(relation) {
    this.includes.push(relation);
    return this;
  }

  select(fields) {
    this.selectFields = Array.isArray(fields) ? fields : [fields];
    return this;
  }

  async get() {
    const where = this.buildWhere();
    return await this.model.find(where, {
      limit: this.limit,
      offset: this.offset,
      order: this.orderBy.join(', '),
      select: this.selectFields.join(', ')
    });
  }

  async first() {
    const results = await this.take(1).get();
    return results[0] || null;
  }

  async count() {
    const where = this.buildWhere();
    return await this.model.count(where);
  }

  async paginate(page = 1, perPage = 20) {
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
        pages: Math.ceil(total / perPage),
        hasNext: page < Math.ceil(total / perPage),
        hasPrev: page > 1
      }
    };
  }

  buildWhere() {
    return Object.assign({}, ...this.whereConditions);
  }

  static from(model) {
    return new QuerySet(model);
  }
}

// ==================== MODEL BASE CLASS ====================
class Model {
  static orm = null;
  static tableName = null;
  static fields = {};
  static indexes = [];
  static options = {};

  constructor(data = {}) {
    this.data = {};
    this.isNew = true;
    this._changes = new Set();
    this._originalData = {};
    
    for (const [fieldName, field] of Object.entries(this.constructor.fields)) {
      if (data[fieldName] !== undefined) {
        this.set(fieldName, data[fieldName]);
      } else if (field.default !== undefined) {
        const defaultValue = typeof field.default === 'function' ? field.default() : field.default;
        this.set(fieldName, defaultValue);
      }
    }
    
    this._originalData = { ...this.data };
  }

  set(fieldName, value) {
    const field = this.constructor.fields[fieldName];
    if (!field) throw new Error(`Field ${fieldName} does not exist in ${this.constructor.tableName}`);
    
    field.validate(value);
    this.data[fieldName] = value;
    this._changes.add(fieldName);
  }

  get(fieldName) {
    return this.data[fieldName];
  }

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

  async delete() {
    if (this.isNew) return;
    
    const primaryKey = Object.entries(this.constructor.fields)
      .find(([_, field]) => field.primaryKey)?.[0];
    
    if (!primaryKey) throw new Error('No primary key defined');
    
    await this.constructor.orm.connection.query(
      `DELETE FROM ${this.constructor.tableName} WHERE ${primaryKey} = ?`,
      [this.get(primaryKey)]
    );
  }

  validate() {
    for (const [fieldName, field] of Object.entries(this.constructor.fields)) {
      const value = this.get(fieldName);
      field.validate(value);
    }
  }

  toJSON() {
    return { ...this.data };
  }

  static query() {
    return new QuerySet(this);
  }

  static async findOne(where = {}, options = {}) {
    const results = await this.find(where, { ...options, limit: 1 });
    return results[0] || null;
  }

  static async find(where = {}, options = {}) {
    const conditions = [];
    const values = [];
    
    for (const [key, value] of Object.entries(where)) {
      conditions.push(`${key} = ?`);
      values.push(value);
    }
    
    let sql = `SELECT ${options.select || '*'} FROM ${this.tableName}`;
    
    if (conditions.length) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    if (options.order) {
      sql += ` ORDER BY ${options.order}`;
    }
    
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }
    
    const [rows] = await this.orm.connection.execute(sql, values);
    
    return rows.map(row => {
      const instance = new this(row);
      instance.isNew = false;
      return instance;
    });
  }

  static async count(where = {}) {
    const conditions = [];
    const values = [];
    
    for (const [key, value] of Object.entries(where)) {
      conditions.push(`${key} = ?`);
      values.push(value);
    }
    
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${
      conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    }`;
    
    const [rows] = await this.orm.connection.execute(sql, values);
    return parseInt(rows[0].count);
  }

  static async sync() {
    const fields = [];
    const foreignKeys = [];
    
    for (const [fieldName, field] of Object.entries(this.fields)) {
      if (field instanceof ForeignKey) {
        fields.push(field.getSQLDefinition(fieldName));
        foreignKeys.push(field.getForeignKeySQL(this.tableName, fieldName));
      } else {
        fields.push(field.getSQLDefinition(fieldName));
      }
    }
    
    const allFields = [...fields, ...foreignKeys];
    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${allFields.join(', ')})`;
    
    try {
      await this.orm.connection.execute(sql);
      console.log(`✅ Table ${this.tableName} synced successfully`);
    } catch (error) {
      console.error(`❌ Failed to sync table ${this.tableName}:`, error.message);
      throw error;
    }
  }

  async insert() {
    const fields = [];
    const values = [];
    const placeholders = [];
    
    for (const [fieldName, value] of Object.entries(this.data)) {
      if (value !== undefined && value !== null) {
        fields.push(fieldName);
        values.push(value);
        placeholders.push('?');
      }
    }
    
    const sql = `INSERT INTO ${this.constructor.tableName} (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const [result] = await this.constructor.orm.connection.execute(sql, values);
    
    const primaryKeyField = Object.entries(this.constructor.fields)
      .find(([_, field]) => field.primaryKey)?.[0];
    
    if (primaryKeyField && result.insertId) {
      this.data[primaryKeyField] = result.insertId;
    }
    
    this.isNew = false;
  }

  async update() {
    if (this._changes.size === 0) return;
    
    const updates = [];
    const values = [];
    
    for (const fieldName of this._changes) {
      updates.push(`${fieldName} = ?`);
      values.push(this.data[fieldName]);
    }
    
    const primaryKey = Object.entries(this.constructor.fields)
      .find(([_, field]) => field.primaryKey)?.[0];
    
    if (!primaryKey) throw new Error('No primary key for update');
    
    values.push(this._originalData[primaryKey]);
    
    const sql = `UPDATE ${this.constructor.tableName} SET ${updates.join(', ')} WHERE ${primaryKey} = ?`;
    await this.constructor.orm.connection.execute(sql, values);
  }
}

// ==================== ULTRA ORM CORE ====================
class UltraORM {
  constructor(config) {
    this.config = config;
    this.connected = false;
    this.models = new Map();
    this.connection = null;
  }

  async connect() {
    if (this.connected) return this;
    
    try {
      switch (this.config.type) {
        case 'postgres':
          this.connection = new Pool({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            port: this.config.port || 5432,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
          });
          break;
        
        case 'mysql':
          this.connection = await mysql.createPool({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            port: this.config.port || 3306,
            connectionLimit: 10,
            acquireTimeout: 60000,
          });
          break;
        
        case 'mongodb':
          const client = new MongoClient(this.config.url, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
          });
          await client.connect();
          this.connection = client.db(this.config.database);
          break;
        
        default:
          throw new Error(`Unsupported database: ${this.config.type}`);
      }
      
      this.connected = true;
      console.log('🚀 UltraORM connected successfully');
      return this;
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  async disconnect() {
    if (!this.connected) return;
    
    try {
      if (this.config.type === 'mongodb') {
        await this.connection.client.close();
      } else {
        await this.connection.end();
      }
      this.connected = false;
      console.log('👋 UltraORM disconnected');
    } catch (error) {
      throw new Error(`Disconnection failed: ${error.message}`);
    }
  }

  model(name) {
    return this.models.get(name);
  }

  registerModel(ModelClass) {
    ModelClass.orm = this;
    this.models.set(ModelClass.tableName, ModelClass);
    return ModelClass;
  }

  async migrate() {
    console.log('🔄 Starting database migration...');
    for (const [name, model] of this.models) {
      await model.sync();
    }
    console.log('✅ Database migration completed');
  }

  async transaction(callback) {
    if (this.config.type === 'mongodb') {
      const session = this.connection.client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    } else {
      const conn = await this.connection.getConnection();
      try {
        await conn.beginTransaction();
        const result = await callback(conn);
        await conn.commit();
        return result;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }
  }
}

// ==================== MODEL DEFINITION HELPERS ====================
function model(tableName, options = {}) {
  return function (target) {
    target.tableName = tableName;
    target.options = options;
    
    // Auto-register fields from class properties
    if (!target.fields) {
      target.fields = {};
    }
  };
}

function field(fieldType, options = {}) {
  return function (target, propertyName) {
    if (!target.constructor.fields) {
      target.constructor.fields = {};
    }
    target.constructor.fields[propertyName] = new fieldType(options);
  };
}

// ==================== EXPORTS ====================
module.exports = {
  UltraORM,
  Model,
  QuerySet,
  Field,
  IntegerField,
  BigIntegerField,
  StringField,
  EmailField,
  DateTimeField,
  BooleanField,
  JSONField,
  FloatField,
  ForeignKey,
  model,
  field
};