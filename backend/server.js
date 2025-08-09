import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import apiRoutes from './routes/apiRoutes.js';
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

// --- Middleware Configuration ---

// Whitelist the specific URL of your deployed frontend
const corsOptions = {
  // IMPORTANT: Do not include a trailing slash '/' at the end of the URL
  origin: 'https://neov6.vercel.app', 
  optionsSuccessStatus: 200 // For legacy browser support
};

// Enable Cross-Origin Resource Sharing with your specific options
app.use(cors(corsOptions));

// To handle both development and production, you can use an array:
const whitelist = ['http://localhost:8000', 'https://neov6.vercel.app'];
const dynamicCorsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1 || !origin) { // !origin allows same-origin requests
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}
app.use(cors(dynamicCorsOptions));

// ... rest of your file

// Enable the Express built-in middleware to parse incoming JSON payloads
app.use(express.json());


// --- API Routes ---

// Define a simple root route for health checks or basic info


// VVVV THIS IS WHERE YOU "PLUG IN" YOUR IMPORTED ROUTER VVVV
// Any request that starts with '/api' will be handled by the 'apiRoutes' router.

 app.use('/api/routes', apiRoutes);


// --- Error Handling Middleware (Optional but Recommended) ---
// You would add your custom notFound and errorHandler middleware here


// --- Start the Server ---

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
