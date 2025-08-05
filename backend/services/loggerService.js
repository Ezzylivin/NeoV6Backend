// File: backend/services/loggerService.js
import log from '../models/logModel.js';

export const logToDb = async (userId, message) => {
  try {
    await Log.create({ userId, message });
  } catch (err) {
    console.error(`[Logger Error]: ${err.message}`);
  }
};
