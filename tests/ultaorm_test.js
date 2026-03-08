'use strict';

// 1. Import the library (Assuming you saved the big code block as 'ultra-orm.js')
const { 
    UltraORM, 
    Model, 
    model, 
    field, 
    StringField, 
    EmailField, 
    BooleanField, 
    DateTimeField 
} = require('./../core/ultra-orm');

// 2. Define the User Model
@model('users')
class User extends Model {
  // We do NOT define 'id' here for MongoDB.
  // The engine automatically handles the '_id' -> 'id' mapping.
  // Defining 'id' as an IntegerField would cause validation errors with MongoDB ObjectIds.

  @field(StringField, { maxLength: 100 })
  name;

  @field(EmailField)
  email;

  @field(BooleanField, { default: true })
  isActive;

  @field(DateTimeField, { autoNowAdd: true })
  createdAt;
}

// 3. Main Test Function
async function runTest() {
  const orm = new UltraORM({
    type: 'mongodb',
    url: 'mongodb://127.0.0.1:27017', // Default Mongo URL
    database: 'ultra_orm_test_db'     // Database name
  });

  try {
    console.log('--- Connecting to MongoDB ---');
    await orm.connect();

    console.log('--- Registering Model ---');
    orm.registerModel(User);

    console.log('--- Running Migration (Creating Collection) ---');
    // This calls Model.sync() which creates the collection in Mongo
    await orm.migrate();

    console.log('\n--- Test 1: Creating a User ---');
    const user = new User({
      name: 'John Doe',
      email: 'john.doe@example.com',
      isActive: true
    });

    await user.save();
    console.log('Test passed: User Saved!');
    console.log('User Data:', user.toJSON());
    console.log('Generated _id (mapped to id):', user.get('id'));

    console.log('\n--- Test 2: Finding the User ---');
    // Find by email
    const foundUser = await User.findOne({ email: 'john.doe@example.com' });
    
    if (foundUser) {
      console.log('T User Found!');
      console.log('Test passed-> Found User:', foundUser.toJSON());
    } else {
      console.log('Test failed: User not found.');
    }

    console.log('\n--- Test 3: Creating Multiple Users ---');
    const jane = await new User({ name: 'Jane Smith', email: 'jane@example.com' }).save();
    const bob = await new User({ name: 'Bob Jones', email: 'bob@example.com' }).save();
    console.log(`Test Passed: ->Created Jane (ID: ${jane.get('id')}) and Bob (ID: ${bob.get('id')})`);

    console.log('\n--- Test 4: Querying with .get() ---');
    const allUsers = await User.query().select('name', 'email').get();
    console.log(`Test passed: -> Total Users in DB: ${allUsers.length}`);
    allUsers.forEach(u => console.log(` - ${u.get('name')}: ${u.get('email')}`));

    console.log('\n--- Test 5: Pagination ---');
    const page = await User.query().paginate(1, 2); // Page 1, limit 2
    console.log(`Test passed: Page 1 of users (Limit 2):`);
    page.items.forEach(u => console.log(`   ${u.get('name')}`));
    console.log(`Test passed: Total Pages: ${page.pagination.pages}`);

  } catch (error) {
    console.error('Test Failed: Error during test:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n--- Disconnecting ---');
    await orm.disconnect();
    console.log('👋 Test Complete');
  }
}

// 4. Run the test
runTest();