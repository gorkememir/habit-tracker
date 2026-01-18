const { Pool } = require('pg');
const express = require('express');
const app = express();

// Connection config - uses the Service Name we created!
const pool = new Pool({
  user: 'postgres',
  host: 'postgres-service', // K8s DNS handles this
  database: 'habitdb',
  password: 'mysecretpassword',
  port: 5432,
});

app.get('/', async (req, res) => {
  try {
    // 1. Create table if it doesn't exist
    await pool.query('CREATE TABLE IF NOT EXISTS habits (id SERIAL PRIMARY KEY, name TEXT, date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    
    // 2. Insert a dummy habit
    await pool.query('INSERT INTO habits (name) VALUES ($1)', ['Drank Water']);
    
    // 3. Get total count
    const result = await pool.query('SELECT COUNT(*) FROM habits');
    res.send(`<h1>Habit Tracker v3</h1><p>Total habits tracked: ${result.rows[0].count}</p>`);
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

app.listen(8080, () => console.log('App listening on 8080'));