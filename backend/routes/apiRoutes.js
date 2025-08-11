// File: src/backend/routes/apiRoutes.js (Dynamic Version)

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// --- Boilerplate to get the current directory path in ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. Discover Route Files ---
// Read all files in the current directory ('/routes')
const routeFiles = fs.readdirSync(__dirname).filter(
  (file) =>
    // Keep only files that end with '.js'
    file.endsWith('.js') &&
    // And exclude this file itself to prevent an infinite loop
    file !== 'apiRoutes.js' 
);

// --- 2. Dynamically Import and Mount Each Route ---
// This uses "top-level await", which is a modern ES module feature.
for (const file of routeFiles) {
  try {
    // Dynamically import the module (e.g., './userRoutes.js')
    const routeModule = await import(`./${file}`);
    
    // Generate the URL path from the filename
    // e.g., 'userRoutes.js' becomes '/users'
    const routePath = '/' + file.replace('Routes.js', '');

    // Check if the imported module has a default export (the router)
    if (routeModule.default) {
      // Mount the imported router onto the generated path
      router.use(routePath, routeModule.default);
      console.log(`Dynamically mounted ${file} to /api${routePath}`);
    }
  } catch (error) {
    console.error(`Failed to load route from ${file}:`, error);
  }
}

// --- 3. Export the Fully Configured Router ---
export default router;
