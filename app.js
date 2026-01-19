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
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
});

// 3. DATABASE INITIALIZATION (Self-Healing Schema)
const initDb = async () => {
  try {
    // Create habits table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create completions table to track daily check-ins
    await pool.query(`
      CREATE TABLE IF NOT EXISTS completions (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
        completed_date DATE NOT NULL DEFAULT CURRENT_DATE,
        UNIQUE(habit_id, completed_date)
      )
    `);

    console.log("✅ Database is ready and schema is up to date.");
  } catch (err) {
    console.error("❌ DB Init Error:", err);
  }
};
initDb();

// Helper function to calculate streak
const calculateStreak = async (habitId) => {
  try {
    const result = await pool.query(
      `SELECT completed_date FROM completions 
       WHERE habit_id = $1 
       ORDER BY completed_date DESC`,
      [habitId]
    );
    
    if (result.rows.length === 0) return 0;
    
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < result.rows.length; i++) {
      const completedDate = new Date(result.rows[i].completed_date);
      completedDate.setHours(0, 0, 0, 0);
      
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);
      
      if (completedDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  } catch (err) {
    console.error('Error calculating streak:', err);
    return 0;
  }
};

// 4. ROUTES
// Home Page - View all habits (optimized with single query)
app.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch all data in one optimized query
    const result = await pool.query(`
      WITH habit_completions AS (
        SELECT 
          h.id,
          h.name,
          h.created_at,
          c.completed_date,
          CASE WHEN c.completed_date = $1 THEN true ELSE false END as checked_today
        FROM habits h
        LEFT JOIN completions c ON h.id = c.habit_id
        ORDER BY h.created_at DESC, c.completed_date DESC
      )
      SELECT * FROM habit_completions
    `, [today]);
    
    // Group by habit and calculate streaks
    const habitsMap = new Map();
    
    for (const row of result.rows) {
      if (!habitsMap.has(row.id)) {
        habitsMap.set(row.id, {
          id: row.id,
          name: row.name,
          created_at: row.created_at,
          checkedInToday: false,
          streak: 0,
          completions: []
        });
      }
      
      const habit = habitsMap.get(row.id);
      if (row.checked_today) habit.checkedInToday = true;
      if (row.completed_date) habit.completions.push(row.completed_date);
    }
    
    // Calculate streaks for each habit
    const enrichedHabits = Array.from(habitsMap.values()).map(habit => {
      let streak = 0;
      const todayDate = new Date(today);
      todayDate.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < habit.completions.length; i++) {
        const completedDate = new Date(habit.completions[i]);
        completedDate.setHours(0, 0, 0, 0);
        
        const expectedDate = new Date(todayDate);
        expectedDate.setDate(todayDate.getDate() - i);
        
        if (completedDate.getTime() === expectedDate.getTime()) {
          streak++;
        } else {
          break;
        }
      }
      
      return { ...habit, streak };
    });
    
    res.render('index', { habits: enrichedHabits });
  } catch (err) {
    console.error('Error loading habits:', err);
    res.status(500).send("Database Error: " + err.message);
  }
});

// Add a Habit
app.post('/add', async (req, res) => {
  const { habitName } = req.body;
  
  if (!habitName || habitName.trim().length === 0) {
    return res.status(400).send('Habit name is required');
  }
  
  if (habitName.length > 100) {
    return res.status(400).send('Habit name too long (max 100 characters)');
  }
  
  try {
    await pool.query('INSERT INTO habits (name) VALUES ($1)', [habitName.trim()]);
    res.redirect('/');
  } catch (err) {
    console.error('Error adding habit:', err);
    res.status(500).send("Insert Error: " + err.message);
  }
});

// Check-in for today
app.post('/checkin/:id', async (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Insert or ignore if already checked in today
    await pool.query(
      'INSERT INTO completions (habit_id, completed_date) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, today]
    );
    res.redirect('/');
  } catch (err) {
    res.status(500).send("Check-in Error: " + err.message);
  }
});

// Delete a Habit
app.post('/delete/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM habits WHERE id = $1', [id]);
    res.redirect('/');
  } catch (err) {
    console.error('Error deleting habit:', err);
    res.status(500).send("Delete Error: " + err.message);
  }
});

// Health check endpoint for Kubernetes
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// 5. START SERVER
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`🚀 Habit Tracker running on port ${PORT}`);
});
