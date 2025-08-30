// File: backend/routes/apiRoutes.js

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

/**
 * @route   GET /api/
 * @desc    API health check / root endpoint.
 * @access  Public
 */
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the NeoV6 API! The server is online and running.',
    status: 'OK',
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all route files dynamically except this one
const routeFiles = fs.readdirSync(__dirname).filter(
  (file) => file.endsWith('.js') && file !== 'apiRoutes.js'
);

for (const file of routeFiles) {
  try {
    const routeModule = await import(`./${file}`);

    // ✅ Smart pluralization: avoids double "s"
    const baseName = file.replace('Routes.js', '');
    const routePath = '/' + (baseName.endsWith('s') ? baseName : baseName + 's');

    if (routeModule.default) {
      router.use(routePath, routeModule.default);
      console.log(`✅ Dynamically mounted ${file} to /api${routePath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load route from ${file}:`, error);
  }
}

export default router;
