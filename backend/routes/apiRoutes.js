import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to the NeoV6 API!',
    status: 'OK',
  });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routeFiles = fs.readdirSync(__dirname).filter(
  (file) => file.endsWith('.js') && file !== 'apiRoutes.js'
);

for (const file of routeFiles) {
  try {
    const routeModule = await import(`./${file}`);

    // --- THIS IS THE FIX ---
    // This simpler logic correctly removes 'Routes.js' to create the path.
    // e.g., 'dataRoutes.js' becomes '/data', 'userRoutes.js' becomes '/user'.
    const baseName = file.replace('Routes.js', '');
    const routePath = `/${baseName}`;
    
    if (routeModule.default) {
      router.use(routePath, routeModule.default);
      console.log(`✅ Dynamically mounted ${file} to /api${routePath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load route from ${file}:`, error);
  }
}

export default router;
