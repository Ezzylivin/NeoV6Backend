const Log = require('../models/logModel');

const logToDb = async (userId, message) => {
  try {
    await Log.create({ userId, message });
  } catch (err) {
    console.error(`[Logger Error]: ${err.message}`);
  }
};

module.exports = { logToDb };
