const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  message: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Log', logSchema);
