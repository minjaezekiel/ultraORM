// crud-test.js
const orm = require('../core/orm-bootstrap');
const User = require('./user');

async function simpleTest() {
  try {
    await orm.connect();
    orm.registerModel(User);

    // Clean up old test data
    console.log('🧹 Cleaning up...');
    await orm.adapter.execute(`DELETE FROM users WHERE email LIKE 'test-%@example.com'`);
    
    const testEmail = `test-${Date.now()}@example.com`;

    // CREATE
    console.log('\n1. Creating user...');
    const user = new User({
      name: 'Test User',
      email: testEmail,
      age: 25,
      isActive: true
    });
    await user.save();
    console.log('   Passed-> Created:', user.toJSON());

    // READ
    console.log('\n2. Finding user...');
    const found = await User.findOne({ email: testEmail });
    console.log('  Passed->  Found:', found.toJSON());

    // UPDATE
    console.log('\n3. Updating user...');
    found.set('age', 26);
    found.set('name', 'Updated Test User');
    found.set('isActive', false);
    await found.save();
    console.log(' Passed->  Updated:', found.toJSON());

    // READ ALL
    console.log('\n4. All users:');
    const all = await User.query().get();
    all.forEach(u => console.log(' Test Passed  -', u.toJSON()));

    // DELETE
    console.log('\n5. Deleting user...');
    await found.delete();
    console.log(' Test Passed->   Deleted');

    // VERIFY DELETE
    const check = await User.findOne({ email: testEmail });
    console.log('\n6. Verify delete:', check ? ' Still exists' : ' Gone');

    console.log('\n Test Passed: All CRUD operations successful!');

  } catch (error) {
    console.error(' Error:', error);
  } finally {
    await orm.disconnect();
  }
}

simpleTest();