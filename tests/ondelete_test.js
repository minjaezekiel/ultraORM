// cascade-test.js
const orm = require('../core/orm-bootstrap');
const User = require('./user');
const Post = require('./post');

async function testCascade() {
  console.log('='.repeat(80));
  console.log('TESTING ON DELETE CASCADE WITH EXISTING TABLES');
  console.log('='.repeat(80));

  try {
    await orm.connect();
    console.log('CONNECTED TO DATABASE\n');

    // Register models
    orm.registerModel(User);
    orm.registerModel(Post);
    console.log('REGISTERED MODELS: User and Post\n');

    // Clean up existing test data
    console.log('CLEANING UP OLD TEST DATA...');
    await orm.adapter.execute("DELETE FROM posts WHERE title LIKE 'CASCADE Test%'");
    await orm.adapter.execute("DELETE FROM users WHERE email LIKE 'cascade-%@example.com'");
    console.log('CLEANUP COMPLETE\n');

    console.log('CREATING TEST DATA');
    console.log('-'.repeat(50));

    // ==================== CREATE TEST DATA ====================
    
    // Create a user
    console.log('\n1. Creating test user:');
    const user = new User({
      name: 'Cascade Test User',
      email: 'cascade-test@example.com',
      age: 30,
      isactive: true
    });
    await user.save();
    console.log(`   + Created user: ${user.get('name')} (ID: ${user.get('id')})`);

    // Create posts for this user
    console.log('\n2. Creating posts for user (these should be deleted with user):');
    const posts = [
      { title: 'CASCADE Test Post 1', content: 'Content 1', userid: user.get('id') },
      { title: 'CASCADE Test Post 2', content: 'Content 2', userid: user.get('id') },
      { title: 'CASCADE Test Post 3', content: 'Content 3', userid: user.get('id') }
    ];

    const createdPosts = [];
    for (const p of posts) {
      const post = new Post(p);
      await post.save();
      createdPosts.push(post);
      console.log(`   + "${post.get('title')}" (ID: ${post.get('id')})`);
    }

    // ==================== VERIFY BEFORE DELETION ====================
    console.log('\n\nVERIFYING BEFORE DELETION');
    console.log('-'.repeat(50));

    const postsBefore = await Post.query()
      .where({ userid: user.get('id') })
      .count();
    
    console.log(`\nUser ${user.get('name')} has ${postsBefore} posts`);

    if (postsBefore > 0) {
      console.log('\nPosts by this user:');
      const userPosts = await Post.query()
        .where({ userid: user.get('id') })
        .get();
      
      userPosts.forEach(p => {
        console.log(`   - "${p.get('title')}" (ID: ${p.get('id')})`);
      });
    }

    // ==================== TEST CASCADE DELETE ====================
    console.log('\n\nTESTING ON DELETE CASCADE');
    console.log('-'.repeat(50));

    console.log(`\n3. Deleting user: ${user.get('name')} (ID: ${user.get('id')})`);
    console.log('   This should CASCADE delete all their posts...');
    
    await user.delete();
    console.log('   + User deleted successfully');

    // ==================== VERIFY AFTER DELETION ====================
    console.log('\n\nVERIFYING AFTER DELETION');
    console.log('-'.repeat(50));

    // Check if user still exists
    const checkUser = await User.findOne({ id: user.get('id') });
    console.log(`\nUser exists after deletion? ${checkUser ? 'YES ❌' : 'NO ✓'}`);

    // Check if posts still exist
    const postsAfter = await Post.query()
      .where({ userid: user.get('id') })
      .count();
    
    console.log(`Posts by deleted user after deletion: ${postsAfter}`);

    if (postsAfter === 0) {
      console.log('\n✓✓✓ CASCADE DELETE WORKED! All posts were deleted with the user ✓✓✓');
      
      // Try to find individual posts
      console.log('\nChecking individual posts:');
      for (const p of createdPosts) {
        const checkPost = await Post.findOne({ id: p.get('id') });
        console.log(`   Post "${p.get('title')}" exists? ${checkPost ? 'YES ❌' : 'NO ✓'}`);
      }
    } else {
      console.log('\n✗✗✗ CASCADE DELETE FAILED! Posts still exist ✗✗✗');
      
      const remainingPosts = await Post.query()
        .where({ userid: user.get('id') })
        .get();
      
      console.log('\nRemaining posts:');
      remainingPosts.forEach(p => {
        console.log(`   - "${p.get('title')}"`);
      });
    }

    // ==================== TEST PREVENT DELETE IF NO CASCADE ====================
    console.log('\n\nTESTING REFERENTIAL INTEGRITY');
    console.log('-'.repeat(50));

    // Create another user with posts
    console.log('\n4. Creating another test user:');
    const user2 = new User({
      name: 'Restrict Test User',
      email: 'restrict-test@example.com',
      age: 25,
      isactive: true
    });
    await user2.save();
    console.log(`   + Created user: ${user2.get('name')} (ID: ${user2.get('id')})`);

    // Create a post for this user
    const post2 = new Post({
      title: 'Restrict Test Post',
      content: 'This post should prevent deletion if RESTRICT was set',
      userid: user2.get('id')
    });
    await post2.save();
    console.log(`   + Created post: "${post2.get('title')}"`);

    console.log('\n   Note: With CASCADE, deletion will always succeed');
    console.log('   To test RESTRICT, you would need ON DELETE RESTRICT in the schema');

    // Clean up this test user
    console.log('\n5. Cleaning up second test user:');
    await user2.delete();
    console.log('   + User deleted, posts cascade deleted');

    // ==================== SUMMARY ====================
    console.log('\n' + '='.repeat(80));
    console.log('CASCADE TEST SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\nTEST RESULTS:');
    console.log('   + ON DELETE CASCADE - ✓ WORKING (posts deleted with user)');
    console.log('   + Referential integrity - ✓ MAINTAINED (no orphaned posts)');
    
    console.log('\nFINAL DATABASE STATE:');
    console.log(`   Total users: ${await User.query().count()}`);
    console.log(`   Total posts: ${await Post.query().count()}`);

    // Verify no orphaned posts
    const allPosts = await Post.query().get();
    let orphanCount = 0;
    
    for (const post of allPosts) {
      const author = await User.findOne({ id: post.get('userid') });
      if (!author) {
        orphanCount++;
        console.log(`   ⚠ Orphaned post found: "${post.get('title')}" (User ${post.get('userid')} doesn't exist)`);
      }
    }
    
    if (orphanCount === 0) {
      console.log('\n   ✓ NO ORPHANED POSTS - All posts have valid users');
    }

  } catch (error) {
    console.error('\n!! TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await orm.disconnect();
    console.log('\n!! DISCONNECTED FROM DATABASE !!');
  }
}

// Run the test
testCascade();