// File: src/backend/routes/apiRoutes.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const mountRoutes = async () => {
  const routeFiles = fs
    .readdirSync(__dirname)
    .filter(file => file.endsWith("Routes.js") && file !== "apiRoutes.js");

  for (const file of routeFiles) {
    try {
      const routeModule = await import(`./${file}`);
      const routePath = "/" + file.replace("Routes.js", "").toLowerCase() + "s";
      if (routeModule.default) {
        router.use(routePath, routeModule.default);
        console.log(`✅ Mounted ${file} -> /api${routePath}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load route from ${file}:`, err);
    }
  }
};

export default router;
