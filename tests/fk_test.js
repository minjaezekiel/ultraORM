// foreign key test
const orm = require('../core/orm-bootstrap');
const User = require('./user');
const Post = require('./post');

(async () => {
  await orm.connect();

  orm.registerModel(User);
  orm.registerModel(Post);

  Post.belongsTo(User, { foreignKey: 'author_id', as: 'author' });
  User.hasMany(Post, { foreignKey: 'author_id', as: 'posts' });

  await orm.migrate();

  const user = new User({ name: 'Bob', email: 'bob@example.com' });
  await user.save();

  const post = new Post({
    title: 'UltraORM + Mongo',
    body: 'It actually works 😎',
    author_id: user.get('id')
  });
  await post.save();

  const posts = await Post.query().include('author').get();

  for (const p of posts) {
    console.log('Post:', p.toJSON());
    console.log('Author:', p.author?.toJSON());
  }

  await orm.disconnect();
})();
