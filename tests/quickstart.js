// quickstart.js
// Example script that registers models, runs simple sync migration (CREATE TABLE IF NOT EXISTS),
// inserts sample data and queries with eager-loading.

const orm = require('./../core/orm-bootstrap');
const User = require('./models/user');
const Post = require('./models/post');

async function main() {
  await orm.connect();

  // register models
  orm.registerModel(User);
  orm.registerModel(Post);

  // define associations
  Post.belongsTo(User, { foreignKey: 'author_id', as: 'author' });
  User.hasMany(Post, { foreignKey: 'author_id', as: 'posts' });

  // run simple sync (create tables if not exists)
  await orm.migrate();

  // create records
  const u = new User({ name: 'Alice', email: 'alice@example.com' });
  await u.save();

  const p1 = new Post({ title: 'Hello', body: 'World', author_id: u.get('id') });
  await p1.save();

  // query and eager-load
  const posts = await Post.query().include('author').get();
  for (const post of posts) {
    console.log('Post:', post.toJSON());
    console.log('Author:', post.author ? post.author.toJSON() : null);
  }

  // transaction example
  await orm.transaction(async (ctx) => {
    const user = new User({ name: 'TxUser', email: `tx+${Date.now()}@example.com` });
    await user.save();
  });

  await orm.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
