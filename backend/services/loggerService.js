// File: backend/services/loggerService.js
import Log from '../dbStructure/log.js';

export const logToDb = async (userId, message) => {
  try {
    await Log.create({ userId, message });
  } catch (err) {
    console.error(`[Logger Error]: ${err.message}`);
  }
};
