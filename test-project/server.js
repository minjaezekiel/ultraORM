// server.js


const express = require('express');
const bodyParser = require('body-parser');

const path = require('path');

//creating  an instance  of  orm  importing  it  from  modules.

const orm = require('ultraorm'); 
const app = express();
//adress  a  port  where  the  server  has  to  listern  
const PORT = 3000;

// Middleware file  (siolazima  kama  unatumia  mvc)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 2. REGISTRATION ENDPOINT
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // A. Check if user already exists using ORM
    const existingUser = await orm.user.findOne({ email: email });

    if (existingUser) {
      return res.send('<h1>Error: Email already registered!</h1><a href="/">Go back</a>');
    }

    // B. Create new user using ORM
    // In a real app, you would hash 'password' with bcrypt here
    const newUser = await orm.user.create({
      name: name,
      email: email,
      password: password 
    });

    console.log('User created:', newUser.toJSON());

    res.send(`
      <h1>Registration Successful!</h1>
      <p>Welcome, ${newUser.get('name')}!</p>
      <p>Your ID: ${newUser.id}</p>
      <a href="/">Register another</a>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send('<h1>Server Error</h1><p>' + err.message + '</p>');
  }
});

// 3. START SERVER (Connect to DB first)
async function start() {
  await orm.connect();
  
  // Sync models (create collections/indexes if they don't exist)
  await orm.migrate();

  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

start();
