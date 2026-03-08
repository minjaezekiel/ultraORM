// post.js - after renaming column
const { Model, IntegerField, StringField, DateTimeField } = require('.././core/ultra-orm');
const User = require('./user');

class Post extends Model {}

Post.tableName = 'posts';
Post.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  title: new StringField({ maxLength: 200, nullable: false }),
  content: new StringField({ dbType: 'TEXT', nullable: false }),
  userid: new IntegerField({ nullable: false }),  // lowercase to match renamed column
  created_at: new DateTimeField({ autoNowAdd: true }),
  updated_at: new DateTimeField({ autoNow: true })
};

// Add associations
Post.associations = {
  author: {
    type: 'belongsTo',
    target: User,
    foreignKey: 'userid',
    as: 'author'
  }
};

User.associations = User.associations || {};
User.associations.posts = {
  type: 'hasMany',
  target: Post,
  foreignKey: 'userid',
  as: 'posts'
};

module.exports = Post;