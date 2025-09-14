import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/', (req, res) => res.status(200).json({ message: 'API is online' }));

const routeFiles = fs.readdirSync(__dirname).filter(
  (file) => file.endsWith('.js') && file !== 'apiRoutes.js'
);

for (const file of routeFiles) {
  try {
    const routeModule = await import(`./${file}`);
    // This line creates the correct path (e.g., /user from userRoutes.js)
    const baseName = file.replace('Routes.js', '');
    const routePath = `/${baseName}`;
    
    if (routeModule.default) {
      router.use(routePath, routeModule.default);
    }
  } catch (error) {
    console.error(`❌ Failed to load route from ${file}:`, error);
  }
}

export default router;
