// orm-migrator-bootstrap.js
const orm = require('./orm-bootstrap');

// Ensure connection is established before exporting
(async () => {
  try {
    await orm.connect();
    console.log('✅ Migrator connected to PostgreSQL');
  } catch (err) {
    console.error('❌ Failed to connect migrator:', err);
    process.exit(1);
  }
})();

module.exports = orm;