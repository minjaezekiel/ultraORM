// user.js
const { Model, IntegerField, StringField, DateTimeField, BooleanField } = require('./../core/ultra-orm');

class User extends Model {}

User.tableName = 'users';
User.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ maxLength: 255, nullable: false }),
  email: new StringField({ maxLength: 255, unique: true, nullable: false }),
  age: new IntegerField({ min: 0, max: 150, nullable: true }),
  isactive: new BooleanField({ default: true }),
  created_at: new DateTimeField({ autoNowAdd: true }),
  updated_at: new DateTimeField({ autoNow: true })
};

module.exports = User;