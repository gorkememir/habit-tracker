const initDb = async () => {
  try {
    // 1. Create the table if it doesn't exist at all
    await pool.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    // 2. Check if the 'created_at' column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='habits' AND column_name='created_at'
    `);

    // 3. If the column is missing, add it automatically
    if (columnCheck.rowCount === 0) {
      console.log("Adding missing 'created_at' column...");
      await pool.query(`
        ALTER TABLE habits ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
    }

    console.log("Database schema is up to date!");
  } catch (err) {
    console.error("DB Init Error:", err);
  }
};

const path = require('path');

// Tell express exactly where the views folder is
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');