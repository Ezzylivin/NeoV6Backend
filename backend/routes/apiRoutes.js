import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/', (req, res) => res.status(200).json({ message: 'API is online' }));

// Self-invoking async function to handle dynamic imports
(async () => {
  try {
    const routeFiles = fs.readdirSync(__dirname).filter(
      (file) => file.endsWith('.js') && file !== 'apiRoutes.js'
    );

    // Create an array of import promises
    const importPromises = routeFiles.map(file => import(`./${file}`));
    
    // Wait for all modules to be imported concurrently
    const modules = await Promise.all(importPromises);

    // Now that all modules are loaded, loop through them and mount the routes
    modules.forEach((routeModule, index) => {
      const file = routeFiles[index];
      const baseName = file.replace('Routes.js', '');
      const routePath = `/${baseName}`;
      
      if (routeModule.default) {
        router.use(routePath, routeModule.default);
        console.log(`✅ Dynamically mounted ${file} to /api${routePath}`);
      }
    });

  } catch (error) {
    console.error('❌ Failed to dynamically load routes:', error);
  }
})();

export default router;
