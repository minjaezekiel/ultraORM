// debug-post.js
const orm = require('../core/orm-bootstrap');
const Post = require('./post');

async function debugPost() {
  await orm.connect();
  
  console.log('Post model fields:');
  console.log(Object.keys(Post.fields));
  
  console.log('\n Post model field definitions:');
  Object.entries(Post.fields).forEach(([key, value]) => {
    console.log(`  ${key}: ${value.constructor.name} (nullable: ${value.nullable})`);
  });
  
  await orm.disconnect();
}

debugPost();