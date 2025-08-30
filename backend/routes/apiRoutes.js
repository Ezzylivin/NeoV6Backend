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

// Wrap dynamic imports in an async function
const mountRoutes = async () => {
  const routeFiles = fs.readdirSync(__dirname).filter(
    file => file.endsWith('Routes.js') && file !== 'apiRoutes.js'
  );

  for (const file of routeFiles) {
    try {
      const routeModule = await import(`./${file}`);
      // Pluralize route path by adding 's'
      const routePath = '/' + file.replace('Routes.js', '').toLowerCase() + 's';
      if (routeModule.default) {
        router.use(routePath, routeModule.default);
        console.log(`✅ Mounted ${file} -> /api${routePath}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load route from ${file}:`, err);
    }
  }
};

// Immediately invoke to mount routes
mountRoutes();

export default router;
