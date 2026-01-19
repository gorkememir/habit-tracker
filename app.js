const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();

// 1. CONFIGURATION (Order is important!)
// Explicitly tell Express where the views folder is using an absolute path
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware to parse form data (needed for Adding and Deleting)
app.use(express.urlencoded({ extended: true }));

// 2. DATABASE CONNECTION
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.POSTGRES_HOST || 'postgres-service',
  database: process.env.POSTGRES_DB || 'habitdb',
  password: process.env.POSTGRES_PASSWORD || 'mysecretpassword',
  port: 5432,
});

// 3. DATABASE INITIALIZATION (Self-Healing Schema)
const initDb = async () => {
  try {
    // Create table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    // Check if the 'created_at' column exists (for older versions of the DB)
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='habits' AND column_name='created_at'
    `);

    // If 'created_at' is missing, add it automatically
    if (columnCheck.rowCount === 0) {
      console.log("Migration: Adding missing 'created_at' column...");
      await pool.query(`
        ALTER TABLE habits ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
    }

    console.log("✅ Database is ready and schema is up to date.");
  } catch (err) {
    console.error("❌ DB Init Error:", err);
  }
};
initDb();

// 4. ROUTES
// Home Page - View all habits
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM habits ORDER BY created_at DESC');
    res.render('index', { habits: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error: " + err.message);
  }
});

// Add a Habit
app.post('/add', async (req, res) => {
  const { habitName } = req.body;
  try {
    await pool.query('INSERT INTO habits (name) VALUES ($1)', [habitName]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send("Insert Error: " + err.message);
  }
});

// Delete a Habit (The "Done" Button)
app.post('/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM habits WHERE id = $1', [id]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send("Delete Error: " + err.message);
  }
});

// 5. START SERVER
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`🚀 Habit Tracker running on port ${PORT}`);
});
