import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/', (req, res) => res.status(200).json({ message: 'API is online' }));

const routeFiles = fs.readdirSync(__dirname).filter(
  (file) => file.endsWith('Routes.js') && file !== 'apiRoutes.js'
);

routeFiles.forEach(async (file) => {
  try {
    const routeModule = await import(`./${file}`);
    const baseName = file.replace('Routes.js', '');
    const routePath = `/${baseName}`;
    
    if (routeModule.default) {
      router.use(routePath, routeModule.default);
      console.log(`✅ Mounted route: ${routePath} from ${file}`);
    } else {
      console.warn(`⚠️ No default export in ${file}`);
    }
  } catch (error) {
    console.error(`❌ Failed to load route from ${file}:`, error);
  }
});

export default router;
