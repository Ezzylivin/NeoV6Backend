// File: src/backend/routes/apiRoutes.js (Corrected Dynamic Version)

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routeFiles = fs.readdirSync(__dirname).filter(
  (file) => file.endsWith('.js') && file !== 'apiRoutes.js'
);

for (const file of routeFiles) {
  try {
    const routeModule = await import(`./${file}`);
    
    // --- THIS IS THE CORRECTED LINE ---
    // It now correctly creates a plural path, e.g., 'userRoutes.js' -> '/users'
    const routePath = '/' + file.replace('Routes.js', '') + 's');

    if (routeModule.default) {
      router.use(routePath, routeModule.default);
      console.log(`✅ Dynamically mounted ${file} to /api${routePath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load route from ${file}:`, error);
  }
}

export default router;
