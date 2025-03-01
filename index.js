const express = require('express')
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer')
const app = express();
const axios = require('axios');



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


// Remove from cart
app.post('/cart/remove', isAuthenticated, (req, res) => {
  const userId = req.session.userId; // Get the logged-in user's ID from the session
  const productId = parseInt(req.body.productId); // Get the product ID from the form

  const query = 'DELETE FROM cart WHERE user_id = ? AND product_id = ?'; // Use correct column names
  db.query(query, [userId, productId], (err, result) => {
    if (err) {
      console.error('Error removing item from cart:', err);
      return res.status(500).send('Server Error');
    }
    if (result.affectedRows === 0) {
      console.log('No item found to remove');
    }
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

// Define aboutData (this should match the structure expected by about.ejs)
const aboutData = {
  story: {
      title: "Our Story",
      content: "SHOPIFY was born out of a passion for making quality products accessible to everyone. Founded in 2024, we started as a small team dedicated to curating the best items from around the globe. Today, we’ve grown into a thriving online marketplace, connecting customers with trusted sellers and unbeatable deals."
  },
  mission: [
      { icon: "fas fa-heart", title: "Customer Happiness", description: "We prioritize your satisfaction with every purchase." },
      { icon: "fas fa-globe", title: "Global Reach", description: "Bringing the world’s best products to your doorstep." },
      { icon: "fas fa-star", title: "Top Quality", description: "Curating only the finest items for our customers." }
  ],
  team: [
      { name: "Bramwel Mwambu", role: "Founder & CEO", description: "Bramwel leads SHOPIFY with a vision for innovation and customer-first solutions.", image: "/images/team-member1.jpg" },
      { name: "Miula Khisa", role: "Head of Operations", description: "Miula ensures every order is delivered with speed and precision.", image: "/images/team-member2.jpg" },
      { name: "Emily Brown", role: "Customer Success Manager", description: "Emily is dedicated to making your shopping experience exceptional.", image: "/images/team-member3.jpg" }
  ]
};

// Route for the About page
app.get('/about', (req, res) => {
  try {
      // Render about.ejs and pass aboutData
      res.render('about', { aboutData });
  } catch (err) {
      console.error('Error rendering about page:', err);
      res.status(500).send('Internal Server Error');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});
//MPESA APPLICATION FROM HERE
// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// M-Pesa credentials (use environment variables in production)
require('dotenv').config(); // Add this if using .env file
const consumerKey = process.env.MPESA_CONSUMER_KEY || 'pr36OFaGXunr4EXJ968KVYiav5GzHZqXMh5zohnKnDYHVkmA';
const consumerSecret = process.env.MPESA_CONSUMER_SECRET || 'uY3oa3UGUkkhSzwrkR6FFVHkCGQm40OwkM8tENDBF9AViX7c4G8mBToW6RsLKxqY';
const shortCode = process.env.MPESA_SHORTCODE || '0757042085';
const passkey = process.env.MPESA_PASSKEY || 'YOUR_LIPA_NA_MPESA_PASSKEY';
const callbackUrl = 'https://your-domain.com/api/payments/callback'; // Must be public

// Generate OAuth token
async function getAccessToken() {
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const response = await axios.get(
        'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        {
            headers: { Authorization: `Basic ${auth}` }
        }
    );
    return response.data.access_token;
}

// Routes
app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// Initiate STK Push
app.post('/api/payments/initiate', async (req, res) => {
    try {
        const { phoneNumber, amount } = req.body;
        const token = await getAccessToken();
        
        const timestamp = new Date()
            .toISOString()
            .replace(/[^0-9]/g, '')
            .slice(0, -3);
        const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');

        const response = await axios.post(
            'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                BusinessShortCode: shortCode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: amount,
                PartyA: phoneNumber,
                PartyB: shortCode,
                PhoneNumber: phoneNumber,
                CallBackURL: callbackUrl,
                AccountReference: 'E-commerce Purchase',
                TransactionDesc: 'Payment for order'
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        res.json({
            CheckoutRequestID: response.data.CheckoutRequestID
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to initiate payment' });
    }
});

// Callback endpoint
app.post('/api/payments/callback', (req, res) => {
    const result = req.body.Body.stkCallback;
    const checkoutRequestID = result.CheckoutRequestID;
    const resultCode = result.ResultCode;

    const status = resultCode === 0 ? 'completed' : 'failed';
    // In production, store this in your database
    console.log(`Payment ${checkoutRequestID} status: ${status}`);
    res.status(200).send('Callback received');
});

// Check payment status
app.post('/api/payments/status', async (req, res) => {
    try {
        const { checkoutRequestID } = req.body;
        const token = await getAccessToken();

        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
        const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');

        const response = await axios.post(
            'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
            {
                BusinessShortCode: shortCode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestID
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        const resultCode = response.data.ResultCode;
        res.json({
            status: resultCode === '0' ? 'completed' : 'pending'
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ status: 'failed' });
    }
});

// Success page (optional)
app.get('/success', (req, res) => {
    res.send('<h1>Payment Successful!</h1><p>Thank you for your purchase.</p>');
});

const port = 7000
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})