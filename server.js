require('dotenv').config(); // Load environment variables
const express = require('express');
const { Pool } = require('pg');
const QRCode = require('qrcode');
const cors = require('cors');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json()); // Middleware to parse JSON
app.use(cors()); // Enable CORS

// PostgreSQL connection setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Configure Multer for File Uploads (if needed)
const upload = multer({ storage: multer.memoryStorage() });

/** 
 * Create a new memorial entry 
 */
app.post('/create-memorial', async (req, res) => {
  const { name, bio, passport_photo_url, birth_date, death_date } = req.body;

  if (!name || !passport_photo_url) {
    return res.status(400).json({ error: 'Name and passport photo URL are required.' });
  }

  try {
    // Insert data first to get the generated 'id'
    const result = await pool.query(
      `INSERT INTO memorials (name, bio, passport_photo_url, birth_date, death_date) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, bio, passport_photo_url, birth_date, death_date]
    );

    const memorialId = result.rows[0].id; // ✅ Get the generated ID

    // Generate QR Code storing only the URL
    const qrData = `http://192.168.56.1:5000/memorial/${memorialId}`;
    const qrCodeURL = await QRCode.toDataURL(qrData); 

    // Update the QR Code URL in the database
    await pool.query(`UPDATE memorials SET qr_code_url = $1 WHERE id = $2`, [qrData, memorialId]);

    res.status(201).json({ success: true, id: memorialId, qr_code_url: qrData });
  } catch (error) {
    console.error('Error creating memorial:', error);
    res.status(500).json({ error: 'Internal server error, please try again later.' });
  }
});

/** 
 * Get memorial by ID 
 */
app.get('/memorial/:id', async (req, res) => {
  try {
    console.log(`Fetching profile with ID: ${req.params.id}`); 

    const result = await pool.query(
      'SELECT * FROM memorials WHERE id = $1',
      [req.params.id]  
    );

    if (result.rows.length === 0) {
      console.log("Profile not found in the database.");
      return res.status(404).json({ error: 'Profile not found.' });
    }

    console.log("Profile Found:", result.rows[0]);
    res.status(200).json({ success: true, memorial: result.rows[0] });
  } catch (error) {
    console.error('❌ Error fetching memorial:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

/** 
 * Get all memorials 
 */
app.get('/memorials', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM memorials ORDER BY id DESC');

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No memorials found' });
    }

    res.status(200).json({ success: true, memorials: result.rows });
  } catch (error) {
    console.error('Error fetching memorials:', error);
    res.status(500).json({ error: 'Internal server error, please try again later.' });
  }
});

/** 
 * Update memorial entry 
 */
app.put('/update-memorial/:id', async (req, res) => {
  const { id } = req.params;
  const { name, bio, birth_date, death_date, passport_photo_url } = req.body;

  try {
    // ✅ Ensure QR Code URL remains based on ID
    const qrCodeURL = `http://192.168.56.1:5000/memorial/${id}`;

    const result = await pool.query(
      `UPDATE memorials 
       SET name = $1, bio = $2, birth_date = $3, death_date = $4, passport_photo_url = $5, qr_code_url = $6
       WHERE id = $7 RETURNING *`,
      [name, bio, birth_date, death_date, passport_photo_url, qrCodeURL, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    res.json({ success: true, memorial: result.rows[0] });
  } catch (error) {
    console.error('Error updating memorial:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/approve-memorial/:id', async (req, res) => {
  const { id } = req.params;

  console.log(`🔍 Received PUT request to approve memorial with ID: ${id}`); // ✅ Debugging log

  try {
    const result = await pool.query(
      `UPDATE memorials SET status = 'approved' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      console.log("❌ Error: No memorial found with this ID"); // ✅ Debugging log
      return res.status(404).json({ error: 'Memorial not found' });
    }

    console.log("✅ Memorial approved successfully:", result.rows[0]); // ✅ Debugging log
    res.json({ success: true, memorial: result.rows[0] });
  } catch (error) {
    console.error("❌ Error approving memorial:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/** 
 * Delete a memorial
 */
app.delete('/delete-memorial/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM memorials WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Memorial not found' });
    }

    res.json({ success: true, message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('Error deleting memorial:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
