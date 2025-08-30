// File: backend/routes/apiRoutes.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// Health check
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the NeoV6 API! The server is online and running.',
    status: 'OK',
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routeFiles = fs.readdirSync(__dirname).filter(
  file => file.endsWith('Routes.js') && file !== 'apiRoutes.js'
);

for (const file of routeFiles) {
  const routeModule = await import(`./${file}`);
  // Mount path: remove 'Routes.js' and prefix with '/'
  const routePath = '/' + file.replace('Routes.js', '').toLowerCase();
  if (routeModule.default) {
    router.use(routePath, routeModule.default);
    console.log(`✅ Mounted ${file} -> /api${routePath}`);
  }
}

export default router;
