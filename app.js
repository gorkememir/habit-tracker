const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();

// 1. DATABASE CONNECTION (Must be before session config)
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

// 2. CONFIGURATION (Order is important!)
// Explicitly tell Express where the views folder is using an absolute path
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware to parse form data (needed for Adding and Deleting)
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // For API endpoints

// Session configuration
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  proxy: true, // Trust proxy (for Cloudflare Tunnel)
  cookie: { 
    secure: false, // Cloudflare Tunnel terminates HTTPS, app receives HTTP
    httpOnly: true,
    sameSite: 'lax', // Allow same-site POST requests
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Helper function to get local date in YYYY-MM-DD format
function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 3. DATABASE INITIALIZATION (Self-Healing Schema)
const initDb = async () => {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create habits table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reminder_time TIME
      )
    `);
    
    // Add user_id column if it doesn't exist (migration)
    await pool.query(`
      ALTER TABLE habits 
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS reminder_time TIME
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

// 4. GOOGLE OAUTH CONFIGURATION
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:8080/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let result = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
      
      if (result.rows.length > 0) {
        // User exists
        return done(null, result.rows[0]);
      } else {
        // Create new user
        const newUser = await pool.query(
          'INSERT INTO users (google_id, email, name, picture) VALUES ($1, $2, $3, $4) RETURNING *',
          [profile.id, profile.emails[0].value, profile.displayName, profile.photos[0]?.value]
        );
        return done(null, newUser.rows[0]);
      }
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

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

// Helper function to get local date in YYYY-MM-DD format
function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 5. AUTHENTICATION ROUTES
// Login page
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.render('login');
});

// Google OAuth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  }
);

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/login');
  });
});

// 6. ROUTES
// Home Page - View all habits (optimized with single query)
app.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const today = getLocalDate();
    const sortBy = req.query.sort || 'newest';
    const userId = req.user.id;
    
    // Fetch all data in one optimized query
    const result = await pool.query(`
      WITH habit_completions AS (
        SELECT 
          h.id,
          h.name,
          h.created_at,
          h.reminder_time,
          c.completed_date,
          CASE WHEN c.completed_date = $1 THEN true ELSE false END as checked_today
        FROM habits h
        LEFT JOIN completions c ON h.id = c.habit_id
        WHERE h.user_id = $2
        ORDER BY h.created_at DESC, c.completed_date DESC
      )
      SELECT * FROM habit_completions
    `, [today, userId]);
    
    // Group by habit and calculate streaks
    const habitsMap = new Map();
    
    for (const row of result.rows) {
      if (!habitsMap.has(row.id)) {
        habitsMap.set(row.id, {
          id: row.id,
          name: row.name,
          created_at: row.created_at,
          reminderTime: row.reminder_time,
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
    const totalAllTimeCompletions = enrichedHabits.reduce((sum, h) => sum + h.totalCompletions, 0);
    const completionRate = enrichedHabits.length > 0 
      ? Math.round((enrichedHabits.filter(h => h.checkedInToday).length / enrichedHabits.length) * 100)
      : 0;
    
    const stats = {
      totalHabits: enrichedHabits.length,
      completedToday: enrichedHabits.filter(h => h.checkedInToday).length,
      totalCompletionsThisWeek: enrichedHabits.reduce((sum, h) => {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return sum + h.completions.filter(d => new Date(d) >= weekAgo).length;
      }, 0),
      totalAllTime: totalAllTimeCompletions,
      completionRate: completionRate
    };
    
    res.render('index', { habits: enrichedHabits, stats, sortBy, user: req.user });
  } catch (err) {
    console.error('Error loading habits:', err);
    res.status(500).send("Database Error: " + err.message);
  }
});

// Add a Habit
app.post('/add', ensureAuthenticated, async (req, res) => {
  const { habitName, reminderTime } = req.body;
  const userId = req.user.id;
  
  if (!habitName || habitName.trim().length === 0) {
    return res.status(400).send('Habit name is required');
  }
  
  if (habitName.length > 100) {
    return res.status(400).send('Habit name too long (max 100 characters)');
  }
  
  try {
    await pool.query(
      'INSERT INTO habits (user_id, name, reminder_time) VALUES ($1, $2, $3)',
      [userId, habitName.trim(), reminderTime || null]
    );
    res.redirect('/');
  } catch (err) {
    console.error('Error adding habit:', err);
    res.status(500).send("Insert Error: " + err.message);
  }
});

// Check-in for today
app.post('/checkin/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const today = getLocalDate();
  const userId = req.user.id;
  
  try {
    // Verify habit belongs to user
    const habitCheck = await pool.query(
      'SELECT id FROM habits WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (habitCheck.rows.length === 0) {
      return res.status(403).send('Unauthorized');
    }
    
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
app.post('/delete/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const result = await pool.query(
      'DELETE FROM habits WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (result.rowCount === 0) {
      return res.status(403).send('Unauthorized');
    }
    
    res.redirect('/');
  } catch (err) {
    console.error('Error deleting habit:', err);
    res.status(500).send("Delete Error: " + err.message);
  }
});

// Undo today's check-in
app.post('/undo/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const today = getLocalDate();
  const userId = req.user.id;
  
  try {
    // Verify habit belongs to user
    const habitCheck = await pool.query(
      'SELECT id FROM habits WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (habitCheck.rows.length === 0) {
      return res.status(403).send('Unauthorized');
    }
    
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
app.post('/edit/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { habitName, reminderTime } = req.body;
  const userId = req.user.id;
  
  if (!habitName || habitName.trim().length === 0) {
    return res.status(400).send('Habit name is required');
  }
  
  if (habitName.length > 100) {
    return res.status(400).send('Habit name too long (max 100 characters)');
  }
  
  try {
    const result = await pool.query(
      'UPDATE habits SET name = $1, reminder_time = $2 WHERE id = $3 AND user_id = $4',
      [habitName.trim(), reminderTime || null, id, userId]
    );
    
    if (result.rowCount === 0) {
      return res.status(403).send('Unauthorized');
    }
    
    res.redirect('/');
  } catch (err) {
    console.error('Error editing habit:', err);
    res.status(500).send("Edit Error: " + err.message);
  }
});

// Get completion history for a habit (API endpoint)
app.get('/api/history/:id', ensureAuthenticated, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const result = await pool.query(
      `SELECT h.name, c.completed_date 
       FROM habits h 
       LEFT JOIN completions c ON h.id = c.habit_id 
       WHERE h.id = $1 AND h.user_id = $2
       ORDER BY c.completed_date DESC`,
      [id, userId]
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

// Get calendar data for a specific month
app.get('/api/calendar', ensureAuthenticated, async (req, res) => {
  const { year, month } = req.query;
  const userId = req.user.id;
  
  if (!year || !month) {
    return res.status(400).json({ error: 'Year and month are required' });
  }
  
  const yearNum = parseInt(year);
  const monthNum = parseInt(month);
  
  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return res.status(400).json({ error: 'Invalid year or month' });
  }
  
  try {
    // Get all completions for the month with habit names
    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${new Date(yearNum, monthNum, 0).getDate()}`;
    
    const result = await pool.query(
      `SELECT c.completed_date::text as completed_date, h.name 
       FROM completions c 
       JOIN habits h ON c.habit_id = h.id 
       WHERE c.completed_date >= $1 AND c.completed_date <= $2 AND h.user_id = $3
       ORDER BY c.completed_date, h.name`,
      [startDate, endDate, userId]
    );
    
    // Group by date
    const calendarData = {};
    result.rows.forEach(row => {
      const dateStr = row.completed_date;
      if (!calendarData[dateStr]) {
        calendarData[dateStr] = [];
      }
      calendarData[dateStr].push(row.name);
    });
    
    res.json(calendarData);
  } catch (err) {
    console.error('Error fetching calendar data:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Export to CSV
app.get('/export', ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const result = await pool.query(`
      SELECT h.name, h.created_at, c.completed_date
      FROM habits h
      LEFT JOIN completions c ON h.id = c.habit_id
      WHERE h.user_id = $1
      ORDER BY h.name, c.completed_date DESC
    `, [userId]);
    
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

// Get latest commit message
app.get('/api/version', (req, res) => {
  const commitMessage = process.env.COMMIT_MESSAGE || 'Unknown';
  const commitSha = process.env.COMMIT_SHA || 'Unknown';
  res.json({ commit: commitSha.substring(0, 7), message: commitMessage });
});

// Check for pending reminders
app.get('/api/reminders', ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  
  try {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = getLocalDate();
    
    // Get habits with reminders due and not yet completed today
    const result = await pool.query(
      `SELECT h.id, h.name, h.reminder_time 
       FROM habits h
       LEFT JOIN completions c ON h.id = c.habit_id AND c.completed_date = $1
       WHERE h.user_id = $2
       AND h.reminder_time IS NOT NULL 
       AND h.reminder_time <= $3::time
       AND c.id IS NULL`,
      [today, userId, currentTime]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reminders:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 5. START SERVER
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`🚀 Habit Tracker running on port ${PORT}`);
});
