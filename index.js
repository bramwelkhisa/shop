const express = require('express')
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer')
const app = express();


// MySQL connection
const db = mysql.createConnection({
    database: "myshop",
    host: "localhost",
    user: "root",
    password: "",
  });

// Middleware setup
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => {
      cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 },
  fileFilter: (req, file, cb) => {
      const filetypes = /jpeg|jpg|png/;
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = filetypes.test(file.mimetype);
      if (extname && mimetype) {
          return cb(null, true);
      } else {
          cb('Error: Images only!');
      }
  }
});


const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
      next();
  } else {
      res.redirect('/login');
  }
};

//routes
app.get('/', (req, res) => {
  db.query('SELECT * FROM products', (err, products) => {
      if (err) throw err;
      res.render('index', { 
          products: products,
          userId: req.session.userId
      });
  });
});
// Signup
app.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});
app.post('/signup', (req, res) => {
  const { username, email, password, is_seller } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
      if (err) throw err;
      db.query('INSERT INTO users (username, email, password, is_seller) VALUES (?, ?, ?, ?)',
          [username, email, hash, is_seller ? 1 : 0],
          (err) => {
              if (err) {
                  res.render('signup', { error: 'Username or email already exists' });
              } else {
                  res.redirect('/login');
              }
          });
  });
});
// Login
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
      if (err) throw err;
      if (results.length === 0) {
          res.render('login', { error: 'User not found' });
          return;
      }
      bcrypt.compare(password, results[0].password, (err, match) => {
          if (match) {
              req.session.userId = results[0].id;
              res.redirect('/');
          } else {
              res.render('login', { error: 'Invalid password' });
          }
      });
  });
});
// Product listing
app.get('/products', (req, res) => {
  db.query('SELECT products.*, users.username as seller_name FROM products JOIN users ON products.seller_id = users.id', 
      (err, products) => {
          if (err) throw err;
          res.render('products', { products: products });
      });
});
// Add product (sellers only)
app.get('/add-product', isAuthenticated, (req, res) => {
  db.query('SELECT is_seller FROM users WHERE id = ?', [req.session.userId], (err, results) => {
      if (err) throw err;
      if (results[0].is_seller) {
          res.render('add-product', { error: null });
      } else {
          res.redirect('/');
      }
  });
});

app.post('/add-product', isAuthenticated, upload.single('image'), (req, res) => {
  const { name, description, price } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  
  db.query('INSERT INTO products (seller_id, name, description, price, image_path) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, name, description, price, imagePath],
      (err) => {
          if (err) throw err;
          res.redirect('/products');
      });
});

// Cart
app.get('/cart', isAuthenticated, (req, res) => {
  db.query(`
      SELECT products.*, cart.quantity 
      FROM cart 
      JOIN products ON cart.product_id = products.id 
      WHERE cart.user_id = ?`,
      [req.session.userId],
      (err, cartItems) => {
          if (err) throw err;
          res.render('cart', { cartItems: cartItems });
      });
});

app.post('/add-to-cart', isAuthenticated, (req, res) => {
  const { productId, quantity } = req.body;
  
  db.query('INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
      [req.session.userId, productId, quantity],
      (err) => {
          if (err) throw err;
          res.redirect('/cart');
      });
});

// Chatroom
app.get('/chat', isAuthenticated, (req, res) => {
  db.query('SELECT * FROM users WHERE id != ?', [req.session.userId], (err, users) => {
      if (err) throw err;
      res.render('chat', { users: users });
  });
});

app.post('/send-message', isAuthenticated, (req, res) => {
  const { receiverId, message } = req.body;
  
  db.query('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
      [req.session.userId, receiverId, message],
      (err) => {
          if (err) throw err;
          res.redirect('/chat');
      });
});
// Contact page
app.get('/contact', (req, res) => {
  res.render('contact');
});
// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});



const port = 7000
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})