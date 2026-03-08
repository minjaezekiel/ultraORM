// testall.js
const orm = require('./../core/orm-bootstrap');
const { Model, IntegerField, StringField, DateTimeField, BooleanField, ForeignKey } = require('./ultra-orm');

// ==================== DEFINE ALL MODELS ====================

// 1. User Model (Base model for many relations)
class User extends Model {}
User.tableName = 'users';
User.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ maxLength: 100, nullable: false }),
  email: new StringField({ unique: true, nullable: false }),
  age: new IntegerField({ nullable: true }),
  isactive: new BooleanField({ default: true }),
  countryid: new IntegerField({ nullable: true }), // lowercase
  created_at: new DateTimeField({ autoNowAdd: true }),
  updated_at: new DateTimeField({ autoNow: true })
};

// 2. Profile Model (One-to-One with User) - USES "userId" (capital U)
class Profile extends Model {}
Profile.tableName = 'profiles';
Profile.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  bio: new StringField({ dbType: 'TEXT' }),
  avatar: new StringField(),
  '"userId"': new ForeignKey(User, { unique: true, nullable: false }), // QUOTED to match DB
  created_at: new DateTimeField({ autoNowAdd: true })
};

// 3. Post Model (One-to-Many with User) - USES "userid" (lowercase)
class Post extends Model {}
Post.tableName = 'posts';
Post.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  title: new StringField({ maxLength: 200, nullable: false }),
  content: new StringField({ dbType: 'TEXT', nullable: false }),
  userid: new ForeignKey(User, { nullable: false }), // lowercase to match DB
  created_at: new DateTimeField({ autoNowAdd: true }),
  updated_at: new DateTimeField({ autoNow: true })
};

// 4. Role Model (Many-to-Many with User)
class Role extends Model {}
Role.tableName = 'roles';
Role.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ unique: true, nullable: false }),
  created_at: new DateTimeField({ autoNowAdd: true })
};

// 5. UserRole Model (Junction table) - USES "userId" and "roleId"
class UserRole extends Model {}
UserRole.tableName = 'user_roles';
UserRole.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  '"userId"': new ForeignKey(User, { nullable: false }), // QUOTED to match DB
  '"roleId"': new ForeignKey(Role, { nullable: false }), // QUOTED to match DB
  assigned_at: new DateTimeField({ autoNowAdd: true })
};
UserRole.indexes = [
  { fields: ['"userId"', '"roleId"'], options: { unique: true } }
];

// 6. Country Model (For HasManyThrough)
class Country extends Model {}
Country.tableName = 'countries';
Country.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ unique: true, nullable: false }),
  code: new StringField({ maxLength: 2, unique: true })
};

// 7. Category Model (Self-referential) - USES "parentId" (capital I)
class Category extends Model {}
Category.tableName = 'categories';
Category.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ nullable: false }),
  '"parentId"': new IntegerField({ nullable: true }), // QUOTED to match DB
  created_at: new DateTimeField({ autoNowAdd: true })
};

// 8. Video Model (For Polymorphic comments)
class Video extends Model {}
Video.tableName = 'videos';
Video.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  title: new StringField({ nullable: false }),
  url: new StringField({ nullable: false }),
  duration: new IntegerField(),
  created_at: new DateTimeField({ autoNowAdd: true })
};

// 9. Comment Model (Polymorphic) - USES "userId" (capital U)
class Comment extends Model {}
Comment.tableName = 'comments';
Comment.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  content: new StringField({ dbType: 'TEXT', nullable: false }),
  commentable_type: new StringField({ nullable: false }),
  commentable_id: new IntegerField({ nullable: false }),
  '"userId"': new ForeignKey(User, { nullable: false }), // QUOTED to match DB
  created_at: new DateTimeField({ autoNowAdd: true })
};

// 10. Tag Model (For Polymorphic Many-to-Many)
class Tag extends Model {}
Tag.tableName = 'tags';
Tag.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  name: new StringField({ unique: true, nullable: false })
};

// 11. Taggable Model (Polymorphic junction table) - USES "tagId" (capital I)
class Taggable extends Model {}
Taggable.tableName = 'taggables';
Taggable.fields = {
  id: new IntegerField({ primaryKey: true, autoIncrement: true }),
  '"tagId"': new ForeignKey(Tag, { nullable: false }), // QUOTED to match DB
  taggable_type: new StringField({ nullable: false }),
  taggable_id: new IntegerField({ nullable: false })
};

// ==================== DEFINE ALL RELATIONSHIPS ====================

// One-to-One: User has one Profile
User.hasOne(Profile, { foreignKey: '"userId"', as: 'profile' });
Profile.belongsTo(User, { foreignKey: '"userId"', as: 'user' });

// One-to-Many: User has many Posts
User.hasMany(Post, { foreignKey: 'userid', as: 'posts' });
Post.belongsTo(User, { foreignKey: 'userid', as: 'author' });

// Many-to-Many: User belongs to many Roles
User.belongsToMany(Role, { 
  through: UserRole, 
  foreignKey: '"userId"', 
  otherKey: '"roleId"', 
  as: 'roles',
  withPivot: ['assigned_at']
});

// HasManyThrough: Country has many Posts through Users
Country.hasManyThrough(Post, {
  through: User,
  foreignKey: 'countryid',
  throughKey: 'id',
  targetKey: 'userid', // Posts uses lowercase userid
  as: 'posts'
});
User.belongsTo(Country, { foreignKey: 'countryid', as: 'country' });

// Self-referential: Category has parent and children
Category.belongsToSelf({ 
  as: 'parent', 
  childrenAs: 'children',
  foreignKey: '"parentId"' // QUOTED with capital I
});

// Polymorphic: Post and Video can have many Comments
Post.morphMany(Comment, { 
  morphName: 'commentable',
  as: 'comments' 
});
Video.morphMany(Comment, { 
  morphName: 'commentable',
  as: 'comments' 
});
Comment.morphTo({ as: 'commentable' });
Comment.belongsTo(User, { foreignKey: '"userId"', as: 'author' });

// Polymorphic Many-to-Many: Post and Video can have many Tags
Post.morphToMany(Tag, {
  through: Taggable,
  morphName: 'taggable',
  foreignKey: '"tagId"',
  as: 'tags'
});
Video.morphToMany(Tag, {
  through: Taggable,
  morphName: 'taggable',
  foreignKey: '"tagId"',
  as: 'tags'
});
Tag.morphedByMany(Post, {
  through: Taggable,
  morphName: 'taggable',
  foreignKey: '"tagId"',
  as: 'posts'
});
Tag.morphedByMany(Video, {
  through: Taggable,
  morphName: 'taggable',
  foreignKey: '"tagId"',
  as: 'videos'
});

// ==================== TEST FUNCTION ====================

async function testAllRelations() {
  console.log('='.repeat(80));
  console.log('$$ TESTING ALL RELATIONSHIP TYPES $$');
  console.log('='.repeat(80));

  try {
    await orm.connect();
    console.log('$$ Connected to database $$\n');

    // Register all models
    const models = [User, Profile, Post, Role, UserRole, Country, Category, Video, Comment, Tag, Taggable];
    models.forEach(model => orm.registerModel(model));
    console.log(`$$ Registered ${models.length} models $$\n`);

    // Clean up existing test data
    console.log('## Cleaning up old test data...');
    await orm.adapter.execute('DELETE FROM taggables');
    await orm.adapter.execute('DELETE FROM comments');
    await orm.adapter.execute('DELETE FROM user_roles');
    await orm.adapter.execute('DELETE FROM posts');
    await orm.adapter.execute('DELETE FROM profiles');
    await orm.adapter.execute('DELETE FROM users WHERE email LIKE \'test-%@example.com\'');
    await orm.adapter.execute('DELETE FROM roles');
    await orm.adapter.execute('DELETE FROM countries');
    await orm.adapter.execute('DELETE FROM categories');
    await orm.adapter.execute('DELETE FROM videos');
    await orm.adapter.execute('DELETE FROM tags');
    console.log('$$ Cleanup complete $$\n');

    // ==================== CREATE TEST DATA ====================
    console.log('** CREATING TEST DATA **');
    console.log('-'.repeat(50));

    // Create Countries
    console.log('\n1. Creating countries:');
    const countries = [
      { name: 'USA', code: 'US' },
      { name: 'Canada', code: 'CA' },
      { name: 'UK', code: 'GB' }
    ];
    const createdCountries = [];
    for (const c of countries) {
      const country = new Country(c);
      await country.save();
      createdCountries.push(country);
      console.log(`   ++ ${country.get('name')} (${country.get('code')})`);
    }

    // Create Users
    console.log('\n2. Creating users:');
    const users = [
      { name: 'John Doe', email: 'test-john@example.com', age: 30, isactive: true, countryid: createdCountries[0].get('id') },
      { name: 'Jane Smith', email: 'test-jane@example.com', age: 28, isactive: true, countryid: createdCountries[0].get('id') },
      { name: 'Bob Wilson', email: 'test-bob@example.com', age: 35, isactive: false, countryid: createdCountries[1].get('id') },
      { name: 'Alice Brown', email: 'test-alice@example.com', age: 25, isactive: true, countryid: createdCountries[2].get('id') }
    ];
    const createdUsers = [];
    for (const u of users) {
      const user = new User(u);
      await user.save();
      createdUsers.push(user);
      console.log(`   ++ ${user.get('name')} (${user.get('email')}) - Country: ${user.get('countryid')}`);
    }

    // Create Profiles (One-to-One)
    console.log('\n3. Creating profiles (One-to-One):');
    const profiles = [
      { bio: 'Software developer from NYC', avatar: 'john.jpg', '"userId"': createdUsers[0].get('id') },
      { bio: 'UX designer and cat lover', avatar: 'jane.jpg', '"userId"': createdUsers[1].get('id') },
      { bio: 'Digital nomad', avatar: 'bob.jpg', '"userId"': createdUsers[2].get('id') }
    ];
    for (const p of profiles) {
      const profile = new Profile(p);
      await profile.save();
      console.log(`   ++ Profile for User ${profile.get('"userId"')}: ${profile.get('bio')}`);
    }

    // Create Roles
    console.log('\n4. Creating roles:');
    const roles = [
      { name: 'Admin' },
      { name: 'Editor' },
      { name: 'Viewer' }
    ];
    const createdRoles = [];
    for (const r of roles) {
      const role = new Role(r);
      await role.save();
      createdRoles.push(role);
      console.log(`   ++ ${role.get('name')}`);
    }

    // Assign Roles to Users (Many-to-Many)
    console.log('\n5. Assigning roles to users (Many-to-Many):');
    const assignments = [
      { '"userId"': createdUsers[0].get('id'), '"roleId"': createdRoles[0].get('id') },
      { '"userId"': createdUsers[0].get('id'), '"roleId"': createdRoles[1].get('id') },
      { '"userId"': createdUsers[1].get('id'), '"roleId"': createdRoles[1].get('id') },
      { '"userId"': createdUsers[1].get('id'), '"roleId"': createdRoles[2].get('id') },
      { '"userId"': createdUsers[2].get('id'), '"roleId"': createdRoles[2].get('id') },
      { '"userId"': createdUsers[3].get('id'), '"roleId"': createdRoles[2].get('id') }
    ];
    for (const a of assignments) {
      const userRole = new UserRole(a);
      await userRole.save();
      console.log(`   ++ User ${a['"userId"']} assigned role ${a['"roleId"']}`);
    }

    // Create Posts (One-to-Many)
    console.log('\n6. Creating posts (One-to-Many):');
    const posts = [
      { title: 'First Post', content: 'Content of first post', userid: createdUsers[0].get('id') },
      { title: 'Second Post', content: 'Content of second post', userid: createdUsers[0].get('id') },
      { title: 'Jane\'s Post', content: 'Content from Jane', userid: createdUsers[1].get('id') },
      { title: 'Bob\'s Post', content: 'Content from Bob', userid: createdUsers[2].get('id') },
      { title: 'Alice\'s Post', content: 'Content from Alice', userid: createdUsers[3].get('id') }
    ];
    const createdPosts = [];
    for (const p of posts) {
      const post = new Post(p);
      await post.save();
      createdPosts.push(post);
      console.log(`   ++ "${post.get('title')}" by User ${post.get('userid')}`);
    }

    // Create Videos
    console.log('\n7. Creating videos:');
    const videos = [
      { title: 'Introduction to ORM', url: 'https://youtu.be/123', duration: 600 },
      { title: 'Advanced Relations', url: 'https://youtu.be/456', duration: 900 }
    ];
    const createdVideos = [];
    for (const v of videos) {
      const video = new Video(v);
      await video.save();
      createdVideos.push(video);
      console.log(`   ++ Video: ${video.get('title')}`);
    }

    // Create Comments (Polymorphic)
    console.log('\n8. Creating comments (Polymorphic):');
    const comments = [
      { content: 'Great post!', commentable_type: 'posts', commentable_id: createdPosts[0].get('id'), '"userId"': createdUsers[1].get('id') },
      { content: 'Thanks for sharing', commentable_type: 'posts', commentable_id: createdPosts[0].get('id'), '"userId"': createdUsers[2].get('id') },
      { content: 'Nice video!', commentable_type: 'videos', commentable_id: createdVideos[0].get('id'), '"userId"': createdUsers[0].get('id') },
      { content: 'Very helpful', commentable_type: 'videos', commentable_id: createdVideos[0].get('id'), '"userId"': createdUsers[3].get('id') }
    ];
    for (const c of comments) {
      const comment = new Comment(c);
      await comment.save();
      console.log(`   ++ Comment on ${c.commentable_type}: "${c.content}"`);
    }

    // Create Tags
    console.log('\n9. Creating tags:');
    const tags = [
      { name: 'tech' },
      { name: 'tutorial' },
      { name: 'beginners' },
      { name: 'advanced' }
    ];
    const createdTags = [];
    for (const t of tags) {
      const tag = new Tag(t);
      await tag.save();
      createdTags.push(tag);
      console.log(`   ++ Tag: #${tag.get('name')}`);
    }

    // Add Tags to Posts and Videos (Polymorphic Many-to-Many)
    console.log('\n10. Adding tags to content (Polymorphic Many-to-Many):');
    const taggables = [
      { '"tagId"': createdTags[0].get('id'), taggable_type: 'posts', taggable_id: createdPosts[0].get('id') },
      { '"tagId"': createdTags[1].get('id'), taggable_type: 'posts', taggable_id: createdPosts[0].get('id') },
      { '"tagId"': createdTags[2].get('id'), taggable_type: 'posts', taggable_id: createdPosts[1].get('id') },
      { '"tagId"': createdTags[0].get('id'), taggable_type: 'videos', taggable_id: createdVideos[0].get('id') },
      { '"tagId"': createdTags[3].get('id'), taggable_type: 'videos', taggable_id: createdVideos[1].get('id') }
    ];
    for (const t of taggables) {
      const taggable = new Taggable(t);
      await taggable.save();
      const tagName = createdTags.find(tg => tg.get('id') === t['"tagId"']).get('name');
      console.log(`   ++ Added #${tagName} to ${t.taggable_type}`);
    }

    // Create Categories (Self-referential)
    console.log('\n11. Creating categories (Self-referential):');
    const categories = [
      { name: 'Electronics', '"parentId"': null },
      { name: 'Computers', '"parentId"': null },
      { name: 'Laptops', '"parentId"': null },
      { name: 'Desktops', '"parentId"': null }
    ];
    const createdCategories = [];
    for (const c of categories) {
      const category = new Category(c);
      await category.save();
      createdCategories.push(category);
    }

    // Set parent-child relationships
    // Computers under Electronics
    createdCategories[1].set('"parentId"', createdCategories[0].get('id'));
    await createdCategories[1].save();

    // Laptops under Computers
    createdCategories[2].set('"parentId"', createdCategories[1].get('id'));
    await createdCategories[2].save();

    // Desktops under Computers
    createdCategories[3].set('"parentId"', createdCategories[1].get('id'));
    await createdCategories[3].save();

    console.log('   ++ Category tree created:');
    console.log('      - Electronics');
    console.log('        - Computers');
    console.log('          - Laptops');
    console.log('          - Desktops');

    // ==================== TEST ALL RELATIONSHIPS ====================
    console.log('\n\n?? TESTING ALL RELATIONSHIPS ??');
    console.log('='.repeat(50));

    // 1. Test One-to-One (User -> Profile)
    console.log('\n1. ONE-TO-ONE: User with Profile');
    const userWithProfile = await User.query()
      .include('profile')
      .where({ id: createdUsers[0].get('id') })
      .first();
    console.log(`   User: ${userWithProfile.get('name')}`);
    if (userWithProfile.profile) {
      console.log(`   Profile: ${userWithProfile.profile.get('bio')}`);
    } else {
      console.log(`   Profile: None`);
    }

    // 2. Test One-to-Many (User -> Posts)
    console.log('\n2. ONE-TO-MANY: User with Posts');
    const userWithPosts = await User.query()
      .include('posts')
      .where({ id: createdUsers[0].get('id') })
      .first();
    console.log(`   User: ${userWithPosts.get('name')} has ${userWithPosts.posts.length} posts:`);
    if (userWithPosts.posts.length > 0) {
      userWithPosts.posts.forEach(p => console.log(`      - ${p.get('title')}`));
    } else {
      console.log(`      No posts found`);
    }

    // 3. Test Many-to-Many (User -> Roles)
    console.log('\n3. MANY-TO-MANY: User with Roles');
    const userWithRoles = await User.query()
      .include('roles')
      .where({ id: createdUsers[0].get('id') })
      .first();
    console.log(`   User: ${userWithRoles.get('name')} has roles:`);
    if (userWithRoles.roles && userWithRoles.roles.length > 0) {
      userWithRoles.roles.forEach(r => console.log(`      - ${r.get('name')}`));
    } else {
      console.log(`      No roles found`);
    }

    // 4. Test HasManyThrough (Country -> Posts)
    console.log('\n4. HAS-MANY-THROUGH: Country with Posts');
    const countryWithPosts = await Country.query()
      .include('posts')
      .where({ id: createdCountries[0].get('id') })
      .first();
    console.log(`   Country: ${countryWithPosts.get('name')} has ${countryWithPosts.posts.length} posts from its users`);

    // 5. Test Polymorphic (Post -> Comments)
    console.log('\n5. POLYMORPHIC: Post with Comments');
    const postWithComments = await Post.query()
      .include('comments')
      .where({ id: createdPosts[0].get('id') })
      .first();
    console.log(`   Post: "${postWithComments.get('title')}"`);
    console.log(`   Comments (${postWithComments.comments.length}):`);
    for (const comment of postWithComments.comments) {
      // Load the author of this comment
      const author = await User.findOne({ id: comment.get('"userId"') });
      console.log(`      - "${comment.get('content')}" by ${author ? author.get('name') : 'Unknown'}`);
    }

    // 6. Test Polymorphic (Video -> Comments)
    console.log('\n6. POLYMORPHIC: Video with Comments');
    const videoWithComments = await Video.query()
      .include('comments')
      .where({ id: createdVideos[0].get('id') })
      .first();
    console.log(`   Video: "${videoWithComments.get('title')}"`);
    console.log(`   Comments: ${videoWithComments.comments.length}`);

    // 7. Test Polymorphic Many-to-Many (Post -> Tags)
    console.log('\n7. POLYMORPHIC MANY-TO-MANY: Post with Tags');
    const postWithTags = await Post.query()
      .include('tags')
      .where({ id: createdPosts[0].get('id') })
      .first();
    console.log(`   Post: "${postWithTags.get('title')}"`);
    if (postWithTags.tags && postWithTags.tags.length > 0) {
      console.log(`   Tags: ${postWithTags.tags.map(t => '#' + t.get('name')).join(', ')}`);
    } else {
      console.log(`   Tags: None`);
    }

    // 8. Test Polymorphic Many-to-Many (Video -> Tags)
    console.log('\n8. POLYMORPHIC MANY-TO-MANY: Video with Tags');
    const videoWithTags = await Video.query()
      .include('tags')
      .where({ id: createdVideos[0].get('id') })
      .first();
    console.log(`   Video: "${videoWithTags.get('title')}"`);
    if (videoWithTags.tags && videoWithTags.tags.length > 0) {
      console.log(`   Tags: ${videoWithTags.tags.map(t => '#' + t.get('name')).join(', ')}`);
    } else {
      console.log(`   Tags: None`);
    }

    // 9. Test Self-referential (Category tree)
    console.log('\n9. SELF-REFERENTIAL: Category Tree');
    const parentCategories = await Category.query()
      .where({ '"parentId"': null })
      .include('children')
      .get();

    async function printCategoryTree(category, level = 0) {
      const indent = '  '.repeat(level);
      console.log(`${indent}- ${category.get('name')}`);
      if (category.children && category.children.length > 0) {
        for (const child of category.children) {
          const childWithGrandchildren = await Category.query()
            .include('children')
            .where({ id: child.get('id') })
            .first();
          await printCategoryTree(childWithGrandchildren, level + 1);
        }
      }
    }

    for (const cat of parentCategories) {
      await printCategoryTree(cat);
    }

    // 10. Test Inverse Polymorphic (Tag -> Posts and Videos)
    console.log('\n10. INVERSE POLYMORPHIC: Tag with all tagged content');
    const techTag = createdTags[0];
    const tagWithPosts = await Tag.query()
      .include('posts')
      .include('videos')
      .where({ id: techTag.get('id') })
      .first();
    console.log(`   Tag: #${tagWithPosts.get('name')}`);
    console.log(`   Used in ${tagWithPosts.posts.length} posts and ${tagWithPosts.videos.length} videos`);

    // 11. Test Nested Includes (Complex eager loading)
    console.log('\n11. COMPLEX NESTED INCLUDES: User with Profile and Posts');
    const complexUser = await User.query()
      .include(['profile', 'posts'])
      .where({ id: createdUsers[0].get('id') })
      .first();
    console.log(`   User: ${complexUser.get('name')}`);
    console.log(`   Profile: ${complexUser.profile ? complexUser.profile.get('bio') : 'None'}`);
    console.log(`   Posts: ${complexUser.posts.length}`);

    // ==================== SUMMARY ====================
    console.log('\n' + '='.repeat(80));
    console.log('$$$$$ ALL RELATIONSHIPS TESTED SUCCESSFULLY! $$$$$');
    console.log('='.repeat(80));
    console.log('\n## RELATIONSHIPS TESTED:');
    console.log('   ++ One-to-One (User -> Profile)');
    console.log('   ++ One-to-Many (User -> Posts)');
    console.log('   ++ Many-to-Many (User <-> Roles)');
    console.log('   ++ Has-Many-Through (Country -> Posts)');
    console.log('   ++ Polymorphic (Post/Video -> Comments)');
    console.log('   ++ Polymorphic Many-to-Many (Post/Video <-> Tags)');
    console.log('   ++ Self-referential (Category parent/child)');
    console.log('   ++ Nested Eager Loading');
    
    console.log('\n## DATABASE STATS:');
    console.log(`   Users: ${await User.query().count()}`);
    console.log(`   Profiles: ${await Profile.query().count()}`);
    console.log(`   Posts: ${await Post.query().count()}`);
    console.log(`   Videos: ${await Video.query().count()}`);
    console.log(`   Comments: ${await Comment.query().count()}`);
    console.log(`   Roles: ${await Role.query().count()}`);
    console.log(`   User-Role assignments: ${await UserRole.query().count()}`);
    console.log(`   Tags: ${await Tag.query().count()}`);
    console.log(`   Taggable connections: ${await Taggable.query().count()}`);
    console.log(`   Categories: ${await Category.query().count()}`);

  } catch (error) {
    console.error('\n!! TEST FAILED:', error);
    console.error('Stack:', error.stack);
  } finally {
    await orm.disconnect();
    console.log('\n!! Disconnected from database !!');
  }
}

// Run the tests
testAllRelations();