import Log from '../dbStructure/log.js';

// An enum for log levels
const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

const createLogEntry = async (userId, level, message) => {
  try {
    // Assumes your logModel has a 'level' field
    await Log.create({ userId, level, message });
  } catch (err) {
    console.error(`[Logger Service Error]: ${err.message}`);
  }
};

export const logger = {
  info: (userId, message) => createLogEntry(userId, LOG_LEVELS.INFO, message),
  warn: (userId, message) => createLogEntry(userId, LOG_LEVELS.WARN, message),
  error: (userId, message) => createLogEntry(userId, LOG_LEVELS.ERROR, message),
};

// --- How to use the upgraded logger ---
// import { logger } from '../services/loggerService.js';
// await logger.info(userId, 'Bot started.');
// await logger.error(userId, 'Failed to fetch price data.');
