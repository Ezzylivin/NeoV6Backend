// Correctly import the Mongoose model from the 'models' directory.
// The filename is likely 'logModel.js' based on convention.
import Log from '../dbStructure/log.js';

/**
 * A reusable service function to create a log entry in the database.
 * This is designed as a "fire-and-forget" utility. It will not interrupt
 * the flow of the calling function if logging fails; it will only print an error
 * to the server console.
 *
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user associated with this log event.
 * @param {string} message - The descriptive log message to be stored.
 */
export const logToDb = async (userId, message) => {
  try {
    // This creates a new document in the 'logs' collection
    // with the provided userId and message.
    await Log.create({ userId, message });
  } catch (err) {
    // If logging to the database fails for any reason (e.g., connection issue),
    // we log the error to the console to avoid crashing the main process
    // that called this logger.
    console.error(`[Logger Service Error]: Failed to write log to DB. Error: ${err.message}`);
  }
};
