const path = require('path');
const fs = require('fs');
require('dotenv').config();

const Core = require('./core');

const dbConfig = {
  type: process.env.DB_TYPE || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432'),
  url: process.env.DB_URL
};

const orm = new Core.UltraORM(dbConfig);

// ---------------------------------------------------------
// FIX: EXPORT CLASSES FIRST!
// This ensures that when we require('User.js') below, 
// it gets the fully formed 'Model' class.
// ---------------------------------------------------------
module.exports = orm;
module.exports.Model = Core.Model;
module.exports.StringField = Core.StringField;
module.exports.IntegerField = Core.IntegerField;
module.exports.EmailField = Core.EmailField;
// ... add other fields you need ...

// ---------------------------------------------------------
// NOW LOAD MODELS
// ---------------------------------------------------------
const modelsDir = path.join(process.cwd(), 'models');

if (fs.existsSync(modelsDir)) {
  console.log(`[UltraORM] Scanning models folder: ${modelsDir}`);
  fs.readdirSync(modelsDir)
    .filter(f => f.endsWith('.js'))
    .forEach(file => {
      try {
        const modelPath = path.join(modelsDir, file);
        const ModelClass = require(modelPath);
        
        if (ModelClass && ModelClass.prototype instanceof Core.Model) {
          orm.registerModel(ModelClass);
          console.log(`[UltraORM] Loaded model: ${ModelClass.name}`);
        } else {
          console.warn(`[UltraORM] File ${file} does not export a valid Model class.`);
        }
      } catch (err) {
        console.error(`[UltraORM] Error loading model ${file}:`, err.message);
      }
    });
} else {
  console.warn('[UltraORM] Models folder not found.');
}