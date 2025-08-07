// File: backend/services/loggerService.js
import Log from '../dbStructure/log.js';

/**
 * Creates a log entry in the database.
 * This is a "fire-and-forget" function; it does not throw errors back to the caller,
 * it just logs them to the console to avoid interrupting the main application flow.
 * @param {string} userId - The ID of the user associated with the log event.
 * @param {string} message - The descriptive message to be logged.
 */
export const logToDb = async (userId, message) => {
  try {
    // Creates a new document in the 'logs' collection.
    await Log.create({ userId, message });
  } catch (err) {
    // If logging fails (e.g., database connection issue),
    // log the error to the server console but don't crash the calling process.
    console.error(`[Logger Service Error]: Failed to write log to DB. ${err.message}`);
  }
};
