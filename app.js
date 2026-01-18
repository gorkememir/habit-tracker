const { Pool } = require('pg');
const express = require('express');
const app = express();

// 1. Setup Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

// 2. Database Connection (Using Service Name from K8s)
const pool = new Pool({
  user: 'postgres',
  host: 'postgres-service',
  database: 'habitdb',
  password: 'mysecretpassword', // Ideally use process.env.DB_PASSWORD later
  port: 5432,
});

// 3. Initialize Database Table
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Database initialized");
  } catch (err) {
    console.error("DB Init Error:", err);
  }
};
initDb();

// 4. Routes
// View all habits
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM habits ORDER BY created_at DESC');
    res.render('index', { habits: result.rows });
  } catch (err) {
    res.status(500).send("Database Error: " + err.message);
  }
});

// Add a new habit
app.post('/add', async (req, res) => {
  const { habitName } = req.body;
  try {
    await pool.query('INSERT INTO habits (name) VALUES ($1)', [habitName]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send("Insert Error: " + err.message);
  }
});

// Delete a habit (The 'Done' button)
app.post('/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM habits WHERE id = $1', [id]);
    res.redirect('/');
  } catch (err) {
    res.status(500).send("Delete Error: " + err.message);
  }
});

// 5. Start Server
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Habit Tracker running on port ${PORT}`);
});