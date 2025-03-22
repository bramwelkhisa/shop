const express = require('express')
const mysql = require('mysql');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer')
const app = express();
const axios = require('axios');
const paypal = require('@paypal/checkout-server-sdk');



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
app.use(express.json());

// Middleware to make user data available to all views
app.use((req, res, next) => {
    if (req.session.userId) {
      db.query('SELECT username FROM users WHERE id = ?', [req.session.userId], (err, results) => {
        if (err) {
          console.error(err);
          next();
          return;
        }
        res.locals.userId = req.session.userId;
        res.locals.username = results[0].username;
        next();
      });
    } else {
      res.locals.userId = undefined;
      res.locals.username = undefined;
      next();
    }
  });




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
      res.render('index', { products: products });
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
  
    // Validate receiverId
    if (!receiverId || isNaN(receiverId) || receiverId <= 0) {
      return res.render('chat', { 
        users: [], // We'll fetch users again below
        error: 'Please select a valid user to send a message to.',
        success: null // No success message in case of error
      });
    }
  
    // Fetch available users to re-render the chat page in case of error
    db.query('SELECT * FROM users WHERE id != ?', [req.session.userId], (err, users) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Server Error');
      }
  
      // Insert the message
      db.query(
        'INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
        [req.session.userId, receiverId, message],
        (err) => {
          if (err) {
            console.error(err);
            return res.render('chat', { 
              users: users, 
              error: 'Failed to send message. Please try again.',
              success: null // No success message in case of error
            });
          }
          // Redirect with a success query parameter
          res.redirect('/chat?success=Message+has+been+sent+successfully');
        }
      );
    });
  });
  
  // Update the /chat route to handle success/error messages
  app.get('/chat', isAuthenticated, (req, res) => {
    const success = req.query.success || null; // Get success message from query parameter
    db.query('SELECT * FROM users WHERE id != ?', [req.session.userId], (err, users) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Server Error');
      }
      res.render('chat', { 
        users: users,
        error: null, // No error by default
        success: success // Pass success message to the template
      });
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


// checkout
app.get('/checkout', (req, res)=>{
    res.render('checkout');
})

// Profile route
app.get('/profile', isAuthenticated, (req, res) => {
    const { status, amount } = req.query; // Get payment status and amount from query params

    db.query('SELECT username, email FROM users WHERE id = ?', [req.session.userId], (err, results) => {
        if (err) throw err;
        const user = results[0];

        // Pass payment status to the template
        res.render('profile', { 
            user,
            paymentStatus: status === 'paid' ? 'success' : null,
            paymentAmount: amount || null
        });
    });
});
// PayPal Configuration
const paypalClientId = 'AbkmSy91hgzpnb9HbWEGEA94SEs1V_ePhVkP4KEv4fH1tg5B3wh8QPVqBqSRj5yTvfRWxJk1KuUbkHP_'; // Replace with your Client ID
const paypalClientSecret = 'EHW_DdjZ2SGzGo9Et-_yI9e2Eu2UR9SvGAwTUFB7mi6jDNdtIIHrvyUTmg45D1IUzkrXl_Mu1F2CPBIe'; // Replace with your Secret
const environment = new paypal.core.LiveEnvironment(paypalClientId, paypalClientSecret); // Use LiveEnvironment for production
const paypalClient = new paypal.core.PayPalHttpClient(environment);
// GET route to render payment page
app.get('/pay', isAuthenticated, (req, res) => {
  res.render('pay', { user: req.session.user, clientId: paypalClientId });
});

// Create payment order
app.post('/pay/create-order', isAuthenticated, async (req, res) => {
  const { amount } = req.body;
  console.log('Received amount:', amount); // Debug log

  // Validate amount
  if (!amount || isNaN(amount) || Number(amount) <= 0) {
      console.error('Invalid amount received:', amount);
      return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  // Convert amount to string with 2 decimal places
  const formattedAmount = Number(amount).toFixed(2);
  console.log('Formatted amount for PayPal:', formattedAmount); // Debug log

  const request = new paypal.orders.OrdersCreateRequest();
  request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
          amount: {
              currency_code: 'USD',
              value: formattedAmount // Ensure it's a string like "10.00"
          }
      }]
  });

  try {
      const order = await paypalClient.execute(request);
      console.log('Order created:', order.result); // Debug log
      res.json({ orderID: order.result.id });
  } catch (err) {
      console.error('Error creating order:', err);
      res.status(500).json({ error: 'Failed to create order' });
  }
});

// Capture payment (unchanged, included for completeness)
app.post('/pay/capture-order', isAuthenticated, async (req, res) => {
  const { orderID } = req.body;

  const request = new paypal.orders.OrdersCaptureRequest(orderID);
  request.requestBody({});

  try {
      const capture = await paypalClient.execute(request);
      const captureID = capture.result.purchase_units[0].payments.captures[0].id;

      db.query('INSERT INTO transactions (user_id, paypal_order_id, amount, status) VALUES (?, ?, ?, ?)',
          [req.session.user.id, orderID, capture.result.purchase_units[0].amount.value, 'COMPLETED'],
          (err) => {
              if (err) console.error('Error saving transaction:', err);
          });

      res.json({ status: 'success', captureID });
  } catch (err) {
      console.error('Error capturing order:', err);
      res.status(500).json({ error: 'Failed to capture payment' });
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