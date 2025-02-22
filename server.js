require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const QRCode = require('qrcode');
const cors = require('cors');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json({ limit: "100mb" })); 
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// const APP_BASE_URL = "http://192.168.56.1";
const APP_BASE_URL = process.env.APP_BASE_URL || ""; // Remove hardcoding


// const generateQRCodeUrl = (id) => {
//     return `${APP_BASE_URL}/@${id}`;
// };
const generateQRCodeUrl = (id, req) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`; // Dynamically get the request origin
  return `${baseUrl}/@${id}`;
};


/** 
 * Create a new memorial entry 
 */
app.post('/create-memorial', async (req, res) => {
  // const { name, bio, passport_photo_url, birth_date, death_date } = req.body;
  const { name, bio, passport_photo_url, birth_date, death_date, briefInfo } = req.body;
  // const { name, bio, passport_photo_url, birth_date, death_date, briefInfo = "" } = req.body;



  // const formatDate = (dateString) => {
  //   if (!dateString) return null;
  //   return dateString; 
  // };
  const formatDate = (dateString) => {
    if (!dateString || typeof dateString !== "string") return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date.toISOString().split("T")[0]; 
  };
  

  const formattedDob = birth_date ? formatDate(birth_date) : null;
  const formattedDeathDate = death_date ? formatDate(death_date) : null;
  

  console.log("Received DOB:", birth_date);  // ✅ Logs what the frontend sends
  console.log("Formatted DOB:", formattedDob);
  


  // if (!name || !passport_photo_url) {
  //   return res.status(400).json({ error: 'Name and passport photo URL are required.' });
  // }
  if (!name || !passport_photo_url || !birth_date || !death_date || !bio) {  
    return res.status(400).json({ error: 'Name, birth date, death date, biography, and passport photo URL are required.' });  
  }
  

  try {
    // const result = await pool.query(
    //   `INSERT INTO memorials (name, bio, passport_photo_url, birth_date, death_date) 
    //    VALUES ($1, $2, $3, $4, $5) RETURNING id`,  // ✅ Use `birth_date` instead of `dob`
    //   [name, bio, passport_photo_url, formattedDob, formattedDeathDate]
    // );
    console.log("📩 Creating Profile with Data:", {
      name, bio, passport_photo_url, formattedDob, formattedDeathDate, briefInfo
    });    
    const result = await pool.query(
      `INSERT INTO memorials (name, bio, passport_photo_url, birth_date, death_date, brief_info) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,  
      [name, bio, passport_photo_url, formattedDob, formattedDeathDate, briefInfo]
    );
    
    

    console.log("📩 Insert Data:", { name, bio, passport_photo_url, formattedDob, formattedDeathDate, briefInfo });


    const memorialId = result.rows[0].id;
    // const qrData = `http://192.168.56.1:5000/memorial/${memorialId}`;
    const qrData = `https://memorializeai-backend.onrender.com/memorial/${memorialId}`;
    const qrCodeURL = await QRCode.toDataURL(qrData); 
    

    await pool.query(`UPDATE memorials SET qr_code_url = $1 WHERE id = $2`, [qrData, memorialId]);

    res.status(201).json({ success: true, id: memorialId, qr_code_url: qrCodeURL });
  // } catch (error) {
  //   console.error('Error creating memorial:', error);
  //   res.status(500).json({ error: 'Internal server error, please try again later.' });
  // }

  }
  catch (error) {
    console.error('❌ Database Error:', error);
    if (error.code === '23502') {  // PostgreSQL "NOT NULL violation"
        return res.status(400).json({ error: "Missing required fields." });
    } else if (error.code === '22P02') {  // PostgreSQL "invalid input syntax"
        return res.status(400).json({ error: "Invalid data format. Ensure dates are YYYY-MM-DD." });
    }
    res.status(500).json({ error: "Internal server error. Check server logs for details." });
}


});

/** 
 * Get memorial by ID 
 */
app.get('/memorial/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM memorials WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    res.json({ success: true, memorial: result.rows[0] });
  } catch (error) {
    console.error('Error fetching memorial:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** 
 * Search memorial by Name & Date of Death
 */
app.get('/search-profile', async (req, res) => {
  const { name, death_date } = req.query;

  console.log('🔍 Incoming API Request - Search Profile');
  console.log('➡️ Name:', name);
  console.log('➡️ Death Date:', death_date);

  if (!name || !death_date) {
    console.error("❌ Missing parameters in request");
    return res.status(400).json({ error: "Missing required fields: name and death_date" });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM memorials WHERE LOWER(name) = LOWER($1) AND death_date = $2',
      [name, death_date]
    );

    if (result.rows.length === 0) {
      console.log("❌ No profile found.");
      return res.status(404).json({ success: false, message: "Profile not found" });
    }

    console.log("✅ Profile found:", result.rows[0]);
    res.json({ success: true, profile: result.rows[0] });
  } catch (error) {
    console.error("❌ Server Error:", error);
    res.status(500).json({ error: "Internal server error" });
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
/** 
 * Update memorial entry 
 */
app.put('/update-memorial/:id', async (req, res) => {
  const { id } = req.params;
  const { name, bio, birth_date, death_date, passport_photo_url } = req.body;

  console.log(`🔍 Updating profile ID: ${id}`);
  console.log("📩 Received Data:", req.body);

  // ✅ Validate required fields
  if (!name || !passport_photo_url || !birth_date || !death_date) {  
    return res.status(400).json({ error: 'Name, birth date, death date, and passport photo URL are required.' });  
  }

  try {
    const qrCodeURL = `https://memorializeai-backend.onrender.com//memorial/@${id}`;

    // ✅ Fix: Change `dob` to `birth_date`
    const result = await pool.query(
      `UPDATE memorials 
       SET name = $1, bio = $2, birth_date = $3, death_date = $4, passport_photo_url = $5, qr_code_url = $6
       WHERE id = $7 RETURNING *`,
      [name, bio, birth_date, death_date, passport_photo_url, qrCodeURL, id]
    );

    if (result.rowCount === 0) {
      console.log("❌ Error: Memorial not found.");
      return res.status(404).json({ error: "Memorial not found" });
    }

    console.log("✅ Profile updated successfully:", result.rows[0]);
    res.json({ success: true, memorial: result.rows[0] });

  } catch (error) {  // ✅ Catch block is correctly placed now
    console.error('❌ Database Error:', error);
    if (error.code === '23502') {  // PostgreSQL "NOT NULL violation"
        return res.status(400).json({ error: "Missing required fields." });
    } else if (error.code === '22P02') {  // PostgreSQL "invalid input syntax"
        return res.status(400).json({ error: "Invalid data format. Ensure dates are YYYY-MM-DD." });
    }
    res.status(500).json({ error: "Internal server error. Check server logs for details." });
  }  
});


/** 
 * Approve a Memorial
 */
app.put("/approve-memorial/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE memorials SET status = 'approved' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Memorial not found" });
    }

    console.log(`✅ Memorial ID ${id} approved.`);
    res.json({ success: true, memorial: result.rows[0] });
  } catch (error) {
    console.error("❌ Error approving memorial:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** 
 * Disapprove a Memorial
 */
app.put("/disapprove-memorial/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE memorials SET status = 'pending' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Memorial not found" });
    }

    console.log(`❌ Memorial ID ${id} disapproved.`);
    res.json({ success: true, memorial: result.rows[0] });
  } catch (error) {
    console.error("❌ Error disapproving memorial:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


/** 
 * Delete a Memorial
 */
app.delete('/delete-memorial/:id', async (req, res) => {
  const { id } = req.params;

  console.log(`🔍 Trying to delete memorial with ID: ${id}`);

  try {
    const result = await pool.query('DELETE FROM memorials WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      console.log(`❌ No memorial found with ID: ${id}`);
      return res.status(404).json({ error: 'Memorial not found' });
    }

    console.log(`✅ Successfully deleted memorial with ID: ${id}`);
    res.json({ success: true, message: 'Profile deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting memorial:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Add this at the bottom before `app.listen()`
// app.get("/", (req, res) => {
//   res.send("Welcome to the MemorializeAI Backend API! 🎉 Visit /memorials to get all profiles.");
// });
app.get("/get-openai-key", (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API Key is missing in environment variables!" });
  }
  
  res.json({ api_key: apiKey });
});

app.get("/generate-qrcode/:id", (req, res) => {
  const id = req.params.id;
  const qrCodeUrl = generateQRCodeUrl(id, req);
  res.json({ qrCodeUrl });
});



// Start the server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
