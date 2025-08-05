// File: backend/server.js
import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import apiRoutes from './routes/api.js';


dotenv.config();
connectDB();

const app = express();
app.use(express.json());

app.use('./routes/api', apiRoutes);


const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
