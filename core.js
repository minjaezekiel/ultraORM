'use strict';

const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { MongoClient, ObjectId } = require('mongodb');

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

  getSQLDefinition(fieldName, adapterType = 'mysql') {
    if (this.autoIncrement && adapterType === 'postgres') {
      if (this.primaryKey) {
        let definition = `${fieldName} SERIAL PRIMARY KEY`;
        if (this.unique) definition += ' UNIQUE';
        return definition;
      } else {
        let definition = `${fieldName} SERIAL`;
        if (this.primaryKey) definition += ' PRIMARY KEY';
        if (this.unique) definition += ' UNIQUE';
        if (!this.nullable) definition += ' NOT NULL';
        return definition;
      }
    }

    let dbType = this.dbType || 'TEXT';
    let definition = `${fieldName} ${dbType}`;

    if (this.primaryKey) definition += ' PRIMARY KEY';
    if (this.autoIncrement && adapterType === 'mysql') definition += ' AUTO_INCREMENT';
    if (!this.nullable) definition += ' NOT NULL';
    if (this.unique) definition += ' UNIQUE';
    if (this.default !== undefined && this.default !== null && typeof this.default !== 'function') {
      const defaultValue = typeof this.default === 'string' ? `'${this.default}'` : this.default;
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

  getSQLDefinition(fieldName, adapterType = 'mysql') {
    let definition = super.getSQLDefinition(fieldName, adapterType);
    if (this.autoNowAdd || this.autoNow) {
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

class ForeignKey extends Field {
  constructor(model, options = {}) {
    super(options);
    this.model = model;
    this.onDelete = options.onDelete || 'CASCADE';
    this.onUpdate = options.onUpdate || 'CASCADE';
    this.dbType = options.dbType || 'INT';
    this.nullable = options.nullable ?? false;
  }

  validate(value) {
    if (!this.nullable && (value === null || value === undefined)) {
      throw new Error('Field cannot be null');
    }
    if (value !== null && value !== undefined && typeof value !== 'number') {
      throw new Error('Foreign key must be a number');
    }
  }

  getSQLDefinition(fieldName, adapterType = 'mysql') {
    const base = `${fieldName} ${this.dbType} ${this.nullable ? 'NULL' : 'NOT NULL'}`;
    return base;
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
    if (Array.isArray(relation)) {
      this.includes.push(...relation);
    } else {
      this.includes.push(relation);
    }
    return this;
  }

  select(fields) {
    this.selectFields = Array.isArray(fields) ? fields : [fields];
    return this;
  }

  async get() {
    const where = this.buildWhere();
    const items = await this.model.find(where, {
      limit: this.limit,
      offset: this.offset,
      order: this.orderBy.join(', '),
      select: this.selectFields.join(', ')
    });

    if (!this.includes || this.includes.length === 0) return items;
    await this._eagerLoad(items, this.includes);
    return items;
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

  async _eagerLoad(instances, includes) {
    if (!instances || instances.length === 0) return;

    const ModelClass = this.model;
    const associations = ModelClass.associations || {};
    const dbType = ModelClass.orm.config.type;

    for (const includeName of includes) {
      const assoc = associations[includeName];
      if (!assoc) {
        throw new Error(`Association "${includeName}" not found on model ${ModelClass.tableName}`);
      }

      // Handle MongoDB embedded documents
      if (dbType === 'mongodb' && (assoc.type === 'embedsOne' || assoc.type === 'embedsMany')) {
        for (const inst of instances) {
          const data = inst.get(includeName);
          if (data) {
            if (assoc.type === 'embedsOne') {
              inst[includeName] = new assoc.target(data);
            } else {
              inst[includeName] = data.map(d => new assoc.target(d));
            }
          } else {
            inst[includeName] = assoc.type === 'embedsOne' ? null : [];
          }
        }
        continue;
      }

      if (assoc.type === 'belongsTo') {
        const fk = assoc.foreignKey;
        const target = assoc.target;
        const sourceKey = assoc.sourceKey || 'id';
        const fkValues = [...new Set(instances.map(i => i.get(fk)).filter(v => v !== null && v !== undefined))];
        if (fkValues.length === 0) {
          for (const inst of instances) inst[includeName] = null;
          continue;
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
        
      } else if (assoc.type === 'hasMany') {
        const fk = assoc.foreignKey;
        const target = assoc.target;
        const sourceKey = assoc.sourceKey || 'id';
        const sourceIds = [...new Set(instances.map(i => i.get(sourceKey)).filter(v => v !== null && v !== undefined))];
        if (sourceIds.length === 0) {
          for (const inst of instances) inst[includeName] = [];
          continue;
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
        
      } else if (assoc.type === 'hasOne') {
        const fk = assoc.foreignKey;
        const target = assoc.target;
        const sourceKey = assoc.sourceKey || 'id';
        const sourceIds = [...new Set(instances.map(i => i.get(sourceKey)).filter(v => v !== null && v !== undefined))];
        
        if (sourceIds.length === 0) {
          for (const inst of instances) inst[includeName] = null;
          continue;
        }
        
        const where = {};
        where[fk] = sourceIds.length === 1 ? sourceIds[0] : { $in: sourceIds };
        const related = await target.find(where);
        
        const map = new Map();
        for (const r of related) {
          map.set(String(r.get(fk)), r);
        }
        
        for (const inst of instances) {
          const id = inst.get(sourceKey);
          inst[includeName] = map.get(String(id)) || null;
        }
        
      } else if (assoc.type === 'belongsToMany') {
        const target = assoc.target;
        const through = assoc.through;
        const foreignKey = assoc.foreignKey;
        const otherKey = assoc.otherKey;
        const sourceKey = assoc.sourceKey || 'id';
        
        const sourceIds = [...new Set(instances.map(i => i.get(sourceKey)).filter(v => v !== null && v !== undefined))];
        
        if (sourceIds.length === 0) {
          for (const inst of instances) inst[includeName] = [];
          continue;
        }
        
        let junctionRecords;
        if (typeof through === 'string') {
          const placeholders = sourceIds.map(() => '?').join(',');
          const { rows } = await ModelClass.orm.adapter.execute(
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
          continue;
        }
        
        const targetIds = [...new Set(junctionRecords.map(r => r[otherKey]))];
        
        const targetWhere = {};
        targetWhere.id = targetIds.length === 1 ? targetIds[0] : targetIds;
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
        
      } else if (assoc.type === 'hasManyThrough') {
        const target = assoc.target;
        const through = assoc.through;
        const foreignKey = assoc.foreignKey;
        const throughKey = assoc.throughKey;
        const targetKey = assoc.targetKey;
        const sourceKey = assoc.sourceKey || 'id';
        
        const sourceIds = [...new Set(instances.map(i => i.get(sourceKey)).filter(v => v !== null))];
        if (sourceIds.length === 0) {
          for (const inst of instances) inst[includeName] = [];
          continue;
        }
        
        const throughWhere = {};
        throughWhere[foreignKey] = sourceIds.length === 1 ? sourceIds[0] : sourceIds;
        const throughRecords = await through.find(throughWhere);
        
        if (throughRecords.length === 0) {
          for (const inst of instances) inst[includeName] = [];
          continue;
        }
        
        const throughIds = [...new Set(throughRecords.map(r => r.get(throughKey)))];
        const targetWhere = {};
        targetWhere[targetKey] = throughIds.length === 1 ? throughIds[0] : throughIds;
        const targetRecords = await target.find(targetWhere);
        
        const targetMap = new Map();
        for (const tr of targetRecords) {
          targetMap.set(String(tr.get(targetKey)), tr);
        }
        
        const groups = {};
        for (const tr of throughRecords) {
          const sourceId = String(tr.get(foreignKey));
          const targetId = String(tr.get(throughKey));
          if (!groups[sourceId]) groups[sourceId] = [];
          if (targetMap.has(targetId)) {
            groups[sourceId].push(targetMap.get(targetId));
          }
        }
        
        for (const inst of instances) {
          const id = String(inst.get(sourceKey));
          inst[includeName] = groups[id] || [];
        }
        
      } else if (assoc.type === 'morphMany' || assoc.type === 'morphOne') {
        const target = assoc.target;
        const morphType = assoc.morphType;
        const morphId = assoc.morphId;
        const modelType = ModelClass.tableName;
        
        const sourceIds = [...new Set(instances.map(i => i.get('id')).filter(v => v !== null))];
        if (sourceIds.length === 0) {
          for (const inst of instances) {
            inst[includeName] = assoc.type === 'morphMany' ? [] : null;
          }
          continue;
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
        
      } else if (assoc.type === 'morphTo') {
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
          const TargetModel = ModelClass.orm.model(type);
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
        
      } else if (assoc.type === 'morphToMany' || assoc.type === 'morphedByMany') {
        const target = assoc.target;
        const through = assoc.through;
        const morphType = assoc.morphType;
        const morphId = assoc.morphId;
        const foreignKey = assoc.foreignKey;
        const modelType = ModelClass.tableName;
        
        const sourceIds = [...new Set(instances.map(i => i.get('id')).filter(v => v !== null))];
        if (sourceIds.length === 0) {
          for (const inst of instances) inst[includeName] = [];
          continue;
        }
        
        let junctionWhere;
        if (assoc.type === 'morphToMany') {
          junctionWhere = {
            [morphType]: modelType,
            [morphId]: sourceIds.length === 1 ? sourceIds[0] : sourceIds
          };
        } else {
          junctionWhere = {
            [morphType]: modelType,
            [foreignKey]: sourceIds.length === 1 ? sourceIds[0] : sourceIds
          };
        }
        
        let junctionRecords;
        if (typeof through === 'string') {
          const conditions = Object.entries(junctionWhere)
            .map(([k, v]) => Array.isArray(v) ? `${k} IN (${v.map(() => '?').join(',')})` : `${k} = ?`)
            .join(' AND ');
          const values = Object.values(junctionWhere).flat();
          const { rows } = await ModelClass.orm.adapter.execute(
            `SELECT * FROM ${through} WHERE ${conditions}`,
            values
          );
          junctionRecords = rows;
        } else {
          junctionRecords = await through.find(junctionWhere);
        }
        
        if (junctionRecords.length === 0) {
          for (const inst of instances) inst[includeName] = [];
          continue;
        }
        
        const targetIds = [];
        if (assoc.type === 'morphToMany') {
          targetIds.push(...junctionRecords.map(r => r[foreignKey]));
        } else {
          targetIds.push(...junctionRecords.map(r => r[morphId]));
        }
        
        const uniqueTargetIds = [...new Set(targetIds)];
        
        const targetWhere = { id: uniqueTargetIds.length === 1 ? uniqueTargetIds[0] : uniqueTargetIds };
        const targetRecords = await target.find(targetWhere);
        
        const targetMap = new Map();
        for (const tr of targetRecords) {
          targetMap.set(String(tr.get('id')), tr);
        }
        
        const groups = {};
        for (const jr of junctionRecords) {
          let sourceId, targetId;
          if (assoc.type === 'morphToMany') {
            sourceId = String(jr[morphId]);
            targetId = String(jr[foreignKey]);
          } else {
            sourceId = String(jr[foreignKey]);
            targetId = String(jr[morphId]);
          }
          
          if (!groups[sourceId]) groups[sourceId] = [];
          if (targetMap.has(targetId)) {
            groups[sourceId].push(targetMap.get(targetId));
          }
        }
        
        for (const inst of instances) {
          const id = String(inst.get('id'));
          inst[includeName] = groups[id] || [];
        }
      } else {
        throw new Error(`Unknown association type ${assoc.type}`);
      }
    }
  }
}

// ==================== ADAPTER LAYER ====================
class DBAdapter {
  constructor(config) {
    this.config = config;
    this.type = config.type;
    this.pool = null;
    this.client = null;
  }

  _convertPlaceholders(sql, params) {
    if (this.type !== 'postgres') return { sql, params };
    let idx = 1;
    const newSql = sql.replace(/\?/g, () => `$${idx++}`);
    return { sql: newSql, params };
  }

  async connect() {
    switch (this.type) {
      case 'postgres':
        this.pool = new Pool({
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
        this.pool = await mysql.createPool({
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
        this.client = new MongoClient(this.config.url, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: 10,
        });
        await this.client.connect();
        break;
      default:
        throw new Error(`Unsupported database: ${this.type}`);
    }
    return this;
  }

  async disconnect() {
    try {
      if (this.type === 'postgres' && this.pool) {
        await this.pool.end();
      } else if (this.type === 'mysql' && this.pool) {
        await this.pool.end();
      } else if (this.type === 'mongodb' && this.client) {
        await this.client.close();
      }
    } finally {
      this.pool = null;
      this.client = null;
    }
  }

  async execute(sql, params = []) {
    if (this.type === 'mongodb') {
      throw new Error('Use collection-based methods for MongoDB through model.adapter.client');
    }
    const { sql: finalSql, params: finalParams } = this._convertPlaceholders(sql, params);
    if (this.type === 'postgres') {
      const res = await this.pool.query(finalSql, finalParams);
      return { rows: res.rows, result: res };
    } else if (this.type === 'mysql') {
      const [rows, result] = await this.pool.execute(finalSql, finalParams);
      return { rows, result };
    }
    throw new Error('Unsupported execute');
  }

  async insertReturning(table, data, primaryKey = 'id') {
    const cols = Object.keys(data);
    const vals = Object.values(data);
    if (this.type === 'postgres') {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) RETURNING ${primaryKey}`;
      const res = await this.pool.query(sql, vals);
      return res.rows[0];
    } else if (this.type === 'mysql') {
      const placeholders = cols.map(() => '?').join(', ');
      const [result] = await this.pool.execute(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals);
      return { [primaryKey]: result.insertId, result };
    }
    throw new Error('insertReturning not supported for this DB');
  }

  async transaction(callback) {
    if (this.type === 'mongodb') {
      const session = this.client.startSession();
      try {
        let result;
        await session.withTransaction(async () => {
          result = await callback({ session, db: this.client.db(this.config.database) });
        });
        return result;
      } finally {
        await session.endSession();
      }
    } else if (this.type === 'postgres') {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else if (this.type === 'mysql') {
      const conn = await this.pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await callback(conn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } else {
      throw new Error('Transactions not supported for this DB');
    }
  }
}

// ==================== MODEL BASE CLASS ====================
class Model {
  // Static property to hold the singleton instance reference
  static orm = null;
  static tableName = null;
  static fields = {};
  static indexes = [];
  static options = {};
  static associations = {};

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
      } else {
        this.data[fieldName] = null;
      }
    }

    if (data._id && !this.data.id) {
      this.data.id = data._id;
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

    const pkValue = this.get(primaryKey);
    const sql = `DELETE FROM ${this.constructor.tableName} WHERE ${primaryKey} = ?`;
    await this.constructor.orm.adapter.execute(sql, [pkValue]);
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

  // ------------------- STATIC METHODS -------------------
  
  /**
   * Helper to create and save an instance in one step.
   */
  static async create(data) {
    const instance = new this(data);
    await instance.save();
    return instance;
  }

  static query() {
    return new QuerySet(this);
  }

  static async findOne(where = {}, options = {}) {
    const results = await this.find(where, { ...options, limit: 1 });
    return results[0] || null;
  }

  static _buildWhereClause(where = {}, adapterType = 'mysql') {
    const conditions = [];
    const values = [];
    for (const [key, value] of Object.entries(where)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          conditions.push('1 = 0');
        } else {
          const placeholders = value.map(() => '?').join(', ');
          conditions.push(`${key} IN (${placeholders})`);
          for (const v of value) values.push(v);
        }
      } else if (value && typeof value === 'object' && value.$in) {
        const placeholders = value.$in.map(() => '?').join(', ');
        conditions.push(`${key} IN (${placeholders})`);
        for (const v of value.$in) values.push(v);
      } else {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
    }
    return {
      clause: conditions.length ? conditions.join(' AND ') : '',
      values
    };
  }

  static async find(where = {}, options = {}) {
    if (this.orm.config.type === 'mongodb') {
      const db = this.orm.adapter.client.db(this.orm.config.database);
      const col = db.collection(this.tableName);
      const mongoWhere = {};
      for (const [k, v] of Object.entries(where || {})) {
        if (Array.isArray(v)) mongoWhere[k] = { $in: v.map(x => (this._convertToObjectIdIfNeeded(k, x))) };
        else if (v && typeof v === 'object' && v.$in) {
          mongoWhere[k] = { $in: v.$in.map(x => this._convertToObjectIdIfNeeded(k, x)) };
        } else mongoWhere[k] = this._convertToObjectIdIfNeeded(k, v);
      }
      const cursor = col.find(mongoWhere);
      if (options.limit) cursor.limit(options.limit);
      if (options.offset) cursor.skip(options.offset);
      if (options.order) {
        const orderParts = options.order.split(',').map(s => s.trim());
        const sortObj = {};
        for (const part of orderParts) {
          const [f, d] = part.split(/\s+/);
          sortObj[f] = (d || 'ASC').toUpperCase() === 'ASC' ? 1 : -1;
        }
        cursor.sort(sortObj);
      }
      const docs = await cursor.toArray();
      return docs.map(d => {
        const inst = new this(d);
        inst.isNew = false;
        return inst;
      });
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

  static _convertToObjectIdIfNeeded(fieldName, value) {
    if (!this.orm) return value;
    if (this.orm.config.type !== 'mongodb') return value;
    if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
      return new ObjectId(value);
    }
    return value;
  }

  static async count(where = {}) {
    if (this.orm.config.type === 'mongodb') {
      const col = this.orm.adapter.client.db(this.orm.config.database).collection(this.tableName);
      const mongoWhere = {};
      for (const [k, v] of Object.entries(where || {})) {
        if (Array.isArray(v)) mongoWhere[k] = { $in: v.map(x => (this._convertToObjectIdIfNeeded(k, x))) };
        else if (v && typeof v === 'object' && v.$in) {
          mongoWhere[k] = { $in: v.$in.map(x => this._convertToObjectIdIfNeeded(k, x)) };
        } else mongoWhere[k] = this._convertToObjectIdIfNeeded(k, v);
      }
      return col.countDocuments(mongoWhere || {});
    }
    const { clause, values } = this._buildWhereClause(where);
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${clause ? 'WHERE ' + clause : ''}`;
    const { rows } = await this.orm.adapter.execute(sql, values);
    const count = rows[0] ? (rows[0].count ?? rows[0].COUNT ?? Object.values(rows[0])[0]) : 0;
    return parseInt(count, 10);
  }

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
    for (const [fieldName, field] of Object.entries(this.fields)) {
      if (field instanceof ForeignKey) {
        fields.push(field.getSQLDefinition(fieldName, adapterType));
        foreignKeys.push(field.getForeignKeySQL(this.tableName, fieldName));
      } else {
        fields.push(field.getSQLDefinition(fieldName, adapterType));
      }
    }
    const allFields = [...fields, ...foreignKeys];
    const sql = `CREATE TABLE IF NOT EXISTS ${this.tableName} (${allFields.join(', ')})`;
    try {
      await this.orm.adapter.execute(sql);
      console.log(`✅ Table ${this.tableName} synced successfully`);
    } catch (error) {
      console.error(`❌ Failed to sync table ${this.tableName}:`, error.message);
      throw error;
    }
  }

  async insert() {
    if (this.constructor.orm.config.type === 'mongodb') {
      const col = this.constructor.orm.adapter.client.db(this.constructor.orm.config.database).collection(this.constructor.tableName);
      const data = { ...this.data };
      const res = await col.insertOne(data);
      const pkField = Object.entries(this.constructor.fields).find(([_, f]) => f.primaryKey)?.[0] || '_id';
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
    
    if (fields.length === 0) throw new Error('No data to insert');

    const primaryKeyField = Object.entries(this.constructor.fields)
      .find(([_, field]) => field.primaryKey)?.[0] || 'id';

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
      if (this.constructor.orm.config.type !== 'postgres') {
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO ${this.constructor.tableName} (${fields.join(',')}) VALUES (${placeholders})`;
        const { result } = await this.constructor.orm.adapter.execute(sql, values);
        if (result && result.insertId) {
          this.data[primaryKeyField] = result.insertId;
        }
        this.isNew = false;
      } else {
        throw err;
      }
    }
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
    await this.constructor.orm.adapter.execute(sql, values);
  }

  // ==================== RELATIONSHIP METHODS ====================

  static belongsTo(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName);
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
      this.fields[foreignKey] = new ForeignKey(targetModel, { nullable: options.nullable ?? false });
    }
  }

  static hasMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName + 's');
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const sourceKey = options.sourceKey || 'id';

    this.associations[as] = {
      type: 'hasMany',
      target: targetModel,
      foreignKey,
      sourceKey,
      as
    };

    if (!targetModel.fields[foreignKey]) {
      targetModel.fields[foreignKey] = new ForeignKey(this, { nullable: options.nullable ?? false });
    }
  }

  static hasOne(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName);
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const sourceKey = options.sourceKey || 'id';

    this.associations[as] = {
      type: 'hasOne',
      target: targetModel,
      foreignKey,
      sourceKey,
      as
    };

    if (!targetModel.fields[foreignKey]) {
      targetModel.fields[foreignKey] = new ForeignKey(this, { 
        nullable: options.nullable ?? true,
        unique: true
      });
    }
  }

  static belongsToMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || (targetModel.tableName + 's');
    const through = options.through;
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const otherKey = options.otherKey || `${targetModel.tableName}_id`;
    
    if (!through) {
      throw new Error('belongsToMany requires a "through" option (junction table)');
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

  static hasManyThrough(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || (targetModel.tableName + 's');
    const through = options.through;
    const foreignKey = options.foreignKey || `${this.tableName}_id`;
    const throughKey = options.throughKey || 'id';
    const targetKey = options.targetKey || `${through.tableName}_id`;
    
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

  static morphMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || (targetModel.tableName + 's');
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

  static morphOne(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName);
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

  static morphToMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || (targetModel.tableName + 's');
    const through = options.through;
    const morphName = options.morphName || 'taggable';
    const morphType = options.morphType || `${morphName}_type`;
    const morphId = options.morphId || `${morphName}_id`;
    const foreignKey = options.foreignKey || `${targetModel.tableName}_id`;
    
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

  static morphedByMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    
    const as = options.as || (targetModel.tableName + 's');
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

  static embedsOne(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName);
    
    this.associations[as] = {
      type: 'embedsOne',
      target: targetModel,
      as
    };
  }

  static embedsMany(targetModel, options = {}) {
    if (!this.associations) this.associations = {};
    const as = options.as || (targetModel.tableName + 's');
    
    this.associations[as] = {
      type: 'embedsMany',
      target: targetModel,
      as
    };
  }
}

// ==================== ULTRA ORM CORE ====================
class UltraORM {
  // Singleton instance holder
  static instance = null;

  constructor(config) {
    // Service-style Singleton Logic:
    // If an instance already exists, return it.
    if (UltraORM.instance) {
      return UltraORM.instance;
    }

    this.config = config;
    this.connected = false;
    this.models = new Map();
    this.adapter = new DBAdapter(config);

    // Assign the singleton instance
    UltraORM.instance = this;
  }

  async connect() {
    if (this.connected) return this;
    await this.adapter.connect();
    this.connected = true;
    console.log('🚀 UltraORM connected successfully');
    return this;
  }

  async disconnect() {
    if (!this.connected) return;
    await this.adapter.disconnect();
    this.connected = false;
    console.log('👋 UltraORM disconnected');
  }

  model(name) {
    return this.models.get(name);
  }

  registerModel(ModelClass) {
    // Wire the model to this ORM instance
    ModelClass.orm = this;
    
    if (!ModelClass.fields) ModelClass.fields = {};
    if (!ModelClass.associations) ModelClass.associations = {};

    // Store in internal map
    this.models.set(ModelClass.tableName, ModelClass);

    // 🔹 Attach to ORM instance for Prisma-style access
    // Allows: orm.User.create()
    this[ModelClass.name] = ModelClass;
    
    // 🔹 Lowercase access (Prisma style)
    // Allows: orm.user.create()
    const lowerCaseName = ModelClass.name.charAt(0).toLowerCase() + ModelClass.name.slice(1);
    this[lowerCaseName] = ModelClass;

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
    return await this.adapter.transaction(callback);
  }
}

// ==================== MODEL DEFINITION HELPERS ====================
function model(tableName, options = {}) {
  return function (target) {
    target.tableName = tableName;
    target.options = options;
    if (!target.fields) target.fields = {};
    if (!target.associations) target.associations = {};
  };
}

function field(fieldType, options = {}) {
  return function (target, propertyName) {
    if (!target.constructor.fields) target.constructor.fields = {};
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