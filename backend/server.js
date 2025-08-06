import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';

// VVVV THIS IS THE IMPORT FUNCTION YOU ARE ASKING ABOUT VVVV
// import api from './routes/api.js'; // Import the main API router

// --- Initial Server Setup ---

// Load environment variables from .env file
dotenv.config();

// Connect to the MongoDB database
connectDB();

// Create the Express app instance
const app = express();


// --- Middleware Configuration ---

// Enable Cross-Origin Resource Sharing (CORS) so your frontend can make requests cors() not good
app.use(cors());

// Enable the Express built-in middleware to parse incoming JSON payloads
app.use(express.json());


// --- API Routes ---

// Define a simple root route for health checks or basic info
app.get('/', (req, res) => {
  res.send('API is running successfully...');
});

// VVVV THIS IS WHERE YOU "PLUG IN" YOUR IMPORTED ROUTER VVVV
// Any request that starts with '/api' will be handled by the 'apiRoutes' router.

 //app.use('/api', apiRoutes);


// --- Error Handling Middleware (Optional but Recommended) ---
// You would add your custom notFound and errorHandler middleware here


// --- Start the Server ---

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
