// ultra-orm.js
const Core = require('./core');

// Re-export classes for users to define models
// Usage: const { Model, StringField } = require('ultra-orm');
module.exports = {
  Model: Core.Model,
  Field: Core.Field,
  IntegerField: Core.IntegerField,
  BigIntegerField: Core.BigIntegerField,
  StringField: Core.StringField,
  EmailField: Core.EmailField,
  DateTimeField: Core.DateTimeField,
  BooleanField: Core.BooleanField,
  JSONField: Core.JSONField,
  FloatField: Core.FloatField,
  ForeignKey: Core.ForeignKey,
  QuerySet: Core.QuerySet,
  UltraORM: Core.UltraORM
};