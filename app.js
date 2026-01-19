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
app.use(express.json()); // For API endpoints

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
    const sortBy = req.query.sort || 'newest';
    
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
          completions: [],
          totalCompletions: 0
        });
      }
      
      const habit = habitsMap.get(row.id);
      if (row.checked_today) habit.checkedInToday = true;
      if (row.completed_date) {
        habit.completions.push(row.completed_date);
        habit.totalCompletions++;
      }
    }
    
    // Calculate streaks for each habit
    let enrichedHabits = Array.from(habitsMap.values()).map(habit => {
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
    
    // Apply sorting
    switch (sortBy) {
      case 'oldest':
        enrichedHabits.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'streak':
        enrichedHabits.sort((a, b) => b.streak - a.streak);
        break;
      case 'alphabetical':
        enrichedHabits.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default: // newest
        enrichedHabits.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    // Calculate stats
    const stats = {
      totalHabits: enrichedHabits.length,
      completedToday: enrichedHabits.filter(h => h.checkedInToday).length,
      totalCompletionsThisWeek: enrichedHabits.reduce((sum, h) => {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return sum + h.completions.filter(d => new Date(d) >= weekAgo).length;
      }, 0)
    };
    
    res.render('index', { habits: enrichedHabits, stats, sortBy });
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

// Undo today's check-in
app.post('/undo/:id', async (req, res) => {
  const { id } = req.params;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    await pool.query(
      'DELETE FROM completions WHERE habit_id = $1 AND completed_date = $2',
      [id, today]
    );
    res.redirect('/');
  } catch (err) {
    console.error('Error undoing check-in:', err);
    res.status(500).send("Undo Error: " + err.message);
  }
});

// Edit habit name
app.post('/edit/:id', async (req, res) => {
  const { id } = req.params;
  const { habitName } = req.body;
  
  if (!habitName || habitName.trim().length === 0) {
    return res.status(400).send('Habit name is required');
  }
  
  if (habitName.length > 100) {
    return res.status(400).send('Habit name too long (max 100 characters)');
  }
  
  try {
    await pool.query('UPDATE habits SET name = $1 WHERE id = $2', [habitName.trim(), id]);
    res.redirect('/');
  } catch (err) {
    console.error('Error editing habit:', err);
    res.status(500).send("Edit Error: " + err.message);
  }
});

// Get completion history for a habit (API endpoint)
app.get('/api/history/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT h.name, c.completed_date 
       FROM habits h 
       LEFT JOIN completions c ON h.id = c.habit_id 
       WHERE h.id = $1 
       ORDER BY c.completed_date DESC`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Habit not found' });
    }
    
    res.json({
      name: result.rows[0].name,
      completions: result.rows
        .filter(r => r.completed_date)
        .map(r => r.completed_date)
    });
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export to CSV
app.get('/export', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT h.name, h.created_at, c.completed_date
      FROM habits h
      LEFT JOIN completions c ON h.id = c.habit_id
      ORDER BY h.name, c.completed_date DESC
    `);
    
    // Build CSV
    let csv = 'Habit Name,Created At,Completed Date\n';
    result.rows.forEach(row => {
      csv += `"${row.name}","${row.created_at}","${row.completed_date || ''}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=habits-export.csv');
    res.send(csv);
  } catch (err) {
    console.error('Error exporting data:', err);
    res.status(500).send("Export Error: " + err.message);
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
