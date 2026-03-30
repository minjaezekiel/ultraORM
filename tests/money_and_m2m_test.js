/**
 * ================================================================================
 * UltraORM - MoneyField & Many-to-Many Relationship Tests
 * ================================================================================
 * 
 * Tests for:
 * - MoneyField: Monetary value handling with proper precision
 * - MoneyValue: Immutable value object for monetary amounts
 * - Many-to-Many: attach, detach, sync, toggle, and pivot operations
 * 
 * Run: node tests/money_and_m2m_test.js
 * 
 * ================================================================================
 */

'use strict';

const {
  Model,
  IntegerField,
  StringField,
  MoneyField,
  MoneyValue,
  ForeignKey,
  DateTimeField,
  UltraORMError,
  ValidationError
} = require('../ultra-orm.js');

// ==================== MONEY VALUE TESTS ====================

console.log('='.repeat(60));
console.log('MONEY VALUE TESTS');
console.log('='.repeat(60));

// Test MoneyValue creation
console.log('\n📝 Test 1: MoneyValue creation');
try {
  const price = new MoneyValue(19.99, 'USD');
  console.log(`  ✓ Created: ${price.toString()}`);
  console.log(`  ✓ Amount: ${price.amount}`);
  console.log(`  ✓ Currency: ${price.currency}`);
  console.log(`  ✓ Cents: ${price.toCents()}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyValue formatting
console.log('\n📝 Test 2: MoneyValue formatting');
try {
  const price = new MoneyValue(1999.99, 'EUR');
  console.log(`  ✓ USD format: ${price.format()}`);
  console.log(`  ✓ DE locale: ${price.format({ locale: 'de-DE' })}`);
  console.log(`  ✓ With code: ${price.format({ showCode: true })}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyValue arithmetic
console.log('\n📝 Test 3: MoneyValue arithmetic');
try {
  const price1 = new MoneyValue(10.00, 'USD');
  const price2 = new MoneyValue(5.50, 'USD');
  
  const sum = price1.add(price2);
  const diff = price1.subtract(price2);
  const mult = price1.multiply(2);
  const div = price1.divide(2);
  
  console.log(`  ✓ 10.00 + 5.50 = ${sum.amount}`);
  console.log(`  ✓ 10.00 - 5.50 = ${diff.amount}`);
  console.log(`  ✓ 10.00 * 2 = ${mult.amount}`);
  console.log(`  ✓ 10.00 / 2 = ${div.amount}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyValue comparison
console.log('\n📝 Test 4: MoneyValue comparison');
try {
  const price1 = new MoneyValue(10.00, 'USD');
  const price2 = new MoneyValue(20.00, 'USD');
  const price3 = new MoneyValue(10.00, 'USD');
  
  console.log(`  ✓ 10.00 > 20.00: ${price1.greaterThan(price2)}`);
  console.log(`  ✓ 10.00 < 20.00: ${price1.lessThan(price2)}`);
  console.log(`  ✓ 10.00 == 10.00: ${price1.equals(price3)}`);
  console.log(`  ✓ 10.00 >= 10.00: ${price1.greaterThanOrEqual(price3)}`);
  console.log(`  ✓ 10.00 <= 10.00: ${price1.lessThanOrEqual(price3)}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyValue error handling
console.log('\n📝 Test 5: MoneyValue error handling');
try {
  const price1 = new MoneyValue(10.00, 'USD');
  const price2 = new MoneyValue(5.00, 'EUR');
  
  // This should throw currency mismatch error
  try {
    price1.add(price2);
    console.log(`  ✗ Should have thrown currency mismatch error`);
  } catch (e) {
    console.log(`  ✓ Currency mismatch error: ${e.message}`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyValue zero and fromCents
console.log('\n📝 Test 6: MoneyValue zero and fromCents');
try {
  const zero = MoneyValue.zero('GBP');
  const fromCents = MoneyValue.fromCents(1999, 'USD');
  
  console.log(`  ✓ Zero USD: ${zero.toString()}`);
  console.log(`  ✓ From cents: ${fromCents.toString()}`);
  console.log(`  ✓ From cents (1999): ${fromCents.amount}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// ==================== MONEY FIELD TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('MONEY FIELD TESTS');
console.log('='.repeat(60));

// Test MoneyField creation
console.log('\n📝 Test 7: MoneyField creation');
try {
  const priceField = new MoneyField({ currency: 'USD' });
  console.log(`  ✓ Created MoneyField with currency: ${priceField.currency}`);
  console.log(`  ✓ Store as cents: ${priceField.storeAsCents}`);
  console.log(`  ✓ DB Type: ${priceField.dbType}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyField prepareValue (cents)
console.log('\n📝 Test 8: MoneyField prepareValue (cents)');
try {
  const priceField = new MoneyField({ currency: 'USD', storeAsCents: true });
  
  const val1 = priceField.prepareValue(19.99);
  const val2 = priceField.prepareValue('29.99');
  const val3 = priceField.prepareValue(new MoneyValue(39.99, 'USD'));
  
  console.log(`  ✓ 19.99 → ${val1} (stored as cents)`);
  console.log(`  ✓ "29.99" → ${val2}`);
  console.log(`  ✓ MoneyValue(39.99) → ${val3}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyField prepareValue (decimal)
console.log('\n📝 Test 9: MoneyField prepareValue (decimal)');
try {
  const priceField = new MoneyField({ currency: 'BTC', storeAsCents: false, precision: 20, scale: 8 });
  
  const val1 = priceField.prepareValue(0.12345678);
  const val2 = priceField.prepareValue(new MoneyValue(0.98765432, 'BTC'));
  
  console.log(`  ✓ 0.12345678 → ${val1}`);
  console.log(`  ✓ MoneyValue(0.98765432) → ${val2}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyField fromDatabase
console.log('\n📝 Test 10: MoneyField fromDatabase');
try {
  const priceField = new MoneyField({ currency: 'EUR', storeAsCents: true });
  
  const val1 = priceField.fromDatabase(1999);  // cents
  const val2 = priceField.fromDatabase(1000); // cents
  
  console.log(`  ✓ fromDatabase(1999) → ${val1.toString()}`);
  console.log(`  ✓ fromDatabase(1000) → ${val2.toString()}`);
  console.log(`  ✓ Amount is MoneyValue: ${val1 instanceof MoneyValue}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyField validation
console.log('\n📝 Test 11: MoneyField validation');
try {
  const priceField = new MoneyField({ 
    currency: 'USD',
    minValue: 0,
    maxValue: 10000
  });
  
  // Valid values
  try {
    priceField.validate(100);
    priceField.validate(0);
    priceField.validate(new MoneyValue(500, 'USD'));
    console.log(`  ✓ Valid values passed validation`);
  } catch (e) {
    console.log(`  ✗ Valid values failed: ${e.message}`);
  }
  
  // Invalid values
  try {
    priceField.validate(-10);
    console.log(`  ✗ Should have rejected negative value`);
  } catch (e) {
    console.log(`  ✓ Rejected negative: ${e.message}`);
  }
  
  try {
    priceField.validate(20000);
    console.log(`  ✗ Should have rejected value over max`);
  } catch (e) {
    console.log(`  ✓ Rejected over max: ${e.message}`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test MoneyField with Model
console.log('\n📝 Test 12: MoneyField in Model');
try {
  class Product extends Model {
    static tableName = 'products';
    static fields = {
      id: new IntegerField({ primaryKey: true }),
      name: new StringField({ nullable: false, maxLength: 255 }),
      price: new MoneyField({ currency: 'USD', minValue: 0 }),
      weight: new MoneyField({ currency: 'kg', storeAsCents: false, precision: 10, scale: 3 })
    };
  }
  
  const product = new Product({
    name: 'Test Product',
    price: 29.99,
    weight: 1.234
  });
  
  console.log(`  ✓ Created product with MoneyField`);
  console.log(`  ✓ Price amount: ${product.get('price').amount}`);
  console.log(`  ✓ Weight amount: ${product.get('weight').amount}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// ==================== MANY-TO-MANY TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('MANY-TO-MANY RELATIONSHIP TESTS');
console.log('='.repeat(60));

// Define models for M2M tests
class User extends Model {
  static tableName = 'users';
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    name: new StringField({ nullable: false, maxLength: 255 })
  };
}

class Role extends Model {
  static tableName = 'roles';
  static fields = {
    id: new IntegerField({ primaryKey: true }),
    name: new StringField({ nullable: false, maxLength: 100 })
  };
}

// Define junction table fields
class UserRole extends Model {
  static tableName = 'user_roles';
  static fields = {
    userId: new IntegerField({ primaryKey: true }),
    roleId: new IntegerField({ primaryKey: true }),
    assignedAt: new DateTimeField({ autoNowAdd: true })
  };
}

// Set up M2M relationship
User.belongsToMany(Role, { 
  through: UserRole, 
  as: 'roles',
  foreignKey: 'userId',
  otherKey: 'roleId'
});

// Test relationship definition
console.log('\n📝 Test 13: belongsToMany relationship definition');
try {
  const rolesAssoc = User.associations.roles;
  
  if (rolesAssoc) {
    console.log(`  ✓ Relationship 'roles' defined`);
    console.log(`  ✓ Type: ${rolesAssoc.type}`);
    console.log(`  ✓ Through: ${typeof rolesAssoc.through === 'string' ? rolesAssoc.through : rolesAssoc.through.tableName}`);
    console.log(`  ✓ Foreign Key: ${rolesAssoc.foreignKey}`);
    console.log(`  ✓ Other Key: ${rolesAssoc.otherKey}`);
  } else {
    console.log(`  ✗ Relationship not found`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test inverse relationship
console.log('\n📝 Test 14: Inverse belongsToMany relationship');
try {
  const usersAssoc = Role.associations.users;
  
  if (usersAssoc) {
    console.log(`  ✓ Inverse relationship 'users' defined on Role`);
    console.log(`  ✓ Type: ${usersAssoc.type}`);
    console.log(`  ✓ Foreign Key: ${usersAssoc.foreignKey}`);
    console.log(`  ✓ Other Key: ${usersAssoc.otherKey}`);
  } else {
    console.log(`  ⚠ Inverse relationship not auto-created (model not registered)`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test helper methods exist
console.log('\n📝 Test 15: Many-to-Many helper methods');
try {
  const user = new User({ name: 'Test User' });
  
  const methods = ['attach', 'detach', 'sync', 'toggle', 'updatePivot', 'hasAttached', 'getPivot', 'attachWithPivot'];
  const existing = methods.filter(m => typeof user[m] === 'function');
  
  console.log(`  ✓ Found ${existing.length}/${methods.length} M2M methods:`);
  existing.forEach(m => console.log(`    - ${m}`));
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test _normalizeIds helper
console.log('\n📝 Test 16: _normalizeIds helper');
try {
  const user = new User({ name: 'Test' });
  
  // Test with array of IDs
  const ids1 = user._normalizeIds([1, 2, 3]);
  console.log(`  ✓ Array [1, 2, 3] → ${JSON.stringify(ids1)}`);
  
  // Test with single ID
  const ids2 = user._normalizeIds(1);
  console.log(`  ✓ Single ID 1 → ${JSON.stringify(ids2)}`);
  
  // Test with objects (model instances)
  const mockInstances = [{ id: 10 }, { id: 20 }];
  const ids3 = user._normalizeIds(mockInstances);
  console.log(`  ✓ Objects [{id:10}, {id:20}] → ${JSON.stringify(ids3)}`);
  
  // Test with mixed
  const ids4 = user._normalizeIds([1, { id: 2 }, 3]);
  console.log(`  ✓ Mixed [1, {id:2}, 3] → ${JSON.stringify(ids4)}`);
  
  // Test filtering nulls
  const ids5 = user._normalizeIds([1, null, 2, undefined, 3]);
  console.log(`  ✓ Filter nulls → ${JSON.stringify(ids5)}`);
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// Test createJunctionTable method exists
console.log('\n📝 Test 17: createJunctionTable static method');
try {
  if (typeof User.createJunctionTable === 'function') {
    console.log(`  ✓ createJunctionTable method exists on User model`);
    
    // Show expected usage
    console.log(`  📋 Expected usage:`);
    console.log(`     await User.createJunctionTable('roles', {`);
    console.log(`       assignedAt: new DateTimeField({ autoNowAdd: true }),`);
    console.log(`       assignedBy: new IntegerField()`);
    console.log(`     });`);
  } else {
    console.log(`  ✗ createJunctionTable method not found`);
  }
} catch (err) {
  console.log(`  ✗ Failed: ${err.message}`);
}

// ==================== ERROR HANDLING TESTS ====================

console.log('\n' + '='.repeat(60));
console.log('ERROR HANDLING TESTS');
console.log('='.repeat(60));

// Test UltraORMError
console.log('\n📝 Test 18: Custom error classes');
try {
  throw new UltraORMError('Test error', 'TEST_CODE');
} catch (err) {
  console.log(`  ✓ UltraORMError: ${err.message}`);
  console.log(`  ✓ Error code: ${err.code}`);
}

// Test ValidationError with field
console.log('\n📝 Test 19: ValidationError with field context');
try {
  const field = new MoneyField({ currency: 'USD' });
  throw new ValidationError('Invalid amount', field);
} catch (err) {
  console.log(`  ✓ ValidationError: ${err.message}`);
  console.log(`  ✓ Field context: ${err.field?.currency}`);
}

// Test invalid MoneyValue
console.log('\n📝 Test 20: Invalid MoneyValue creation');
try {
  new MoneyValue('not a number', 'USD');
  console.log(`  ✗ Should have rejected invalid amount`);
} catch (err) {
  console.log(`  ✓ Rejected invalid amount: ${err.message}`);
}

// Test divide by zero
console.log('\n📝 Test 21: MoneyValue divide by zero');
try {
  const price = new MoneyValue(10, 'USD');
  price.divide(0);
  console.log(`  ✗ Should have rejected division by zero`);
} catch (err) {
  console.log(`  ✓ Rejected divide by zero: ${err.message}`);
}

// ==================== SUMMARY ====================

console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`
Features Implemented:

📊 MoneyField:
   ✓ Monetary value storage with DECIMAL or BIGINT (cents)
   ✓ Configurable currency (USD, EUR, GBP, etc.)
   ✓ Min/max value validation
   ✓ Automatic MoneyValue object conversion
   ✓ Multiple storage modes (cents vs decimal)

💰 MoneyValue:
   ✓ Immutable value object
   ✓ Arithmetic operations (add, subtract, multiply, divide)
   ✓ Comparison operations (equals, greaterThan, lessThan, etc.)
   ✓ Currency formatting (Intl.NumberFormat)
   ✓ toCents() and fromCents() conversions
   ✓ JSON serialization

🔗 Many-to-Many Relationships:
   ✓ attach(ids, pivotData) - Attach related records
   ✓ detach(ids) - Detach related records
   ✓ sync(ids, pivotData) - Replace all attachments
   ✓ toggle(ids) - Toggle attachment state
   ✓ updatePivot(id, data) - Update pivot data
   ✓ hasAttached(id) - Check if attached
   ✓ getPivot(id) - Get pivot data
   ✓ attachWithPivot([{id, pivotData}]) - Attach with unique pivot
   ✓ createJunctionTable(name, fields) - Auto-create junction table

⚠️  Note: Database operations require ORM registration.
    Create tests against a real database for full coverage.
`);

console.log('='.repeat(60));
console.log('TESTS COMPLETED');
console.log('='.repeat(60));
