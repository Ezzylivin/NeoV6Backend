// File: backend/routes/apiRoutes.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// Get __dirname equivalent in ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read all route files in the current folder (excluding this one)
const files = fs.readdirSync(__dirname).filter(
  (file) =>
    file.endsWith('.js') &&
    file !== 'apiRoutes.js' // avoid self-import
);

// Dynamically import and mount each route
for (const file of files) {
  const routeModule = await import(`./${file}`);
  const routePath = '/' + file.replace('Routes.js', '').replace('.js', '');
  router.use(routePath, routeModule.default);
}

export default router;
