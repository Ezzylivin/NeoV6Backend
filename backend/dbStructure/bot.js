import mongoose from 'mongoose';

const botSchema = new mongoose.Schema(
  {
    // This creates a direct link to the User who owns this bot instance.
    // It's a required field because a bot cannot exist without a user.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User', // This tells Mongoose to reference the 'User' model.
      unique: true, // IMPORTANT: This ensures one user can only have ONE active bot instance record.
                   // If a user tries to start a second bot, the database will throw a unique index error.
    },
    
    // Simple boolean flag to indicate if the bot's trading loop is currently active.
    isRunning: {
      type: Boolean,
      required: true,
      default: false, // By default, a bot is not running when its record is created.
    },
    
    // The market symbol the bot is trading, e.g., 'BTC/USDT'.
    symbol: {
      type: String,
      required: true,
      uppercase: true, // Good practice to store symbols in a consistent format.
    },
    
    // The name of the trading strategy the bot is using.
    // This allows you to support multiple strategies in the future.
    strategy: {
      type: String,
      required: true,
      default: 'crossoverStrategy', // Set a default strategy.
    },
    
    // --- Configuration fields required to run the bot ---
    amount: {
      type: Number,
      required: [true, 'A trade amount is required to run the bot.'],
    },
    timeframes: {
      type: [String], // Defines an array of strings
      required: [true, 'At least one timeframe is required.'],
    },
    // ---------------------------------------------------
    
    // The timestamp for when the bot was last started.
    // This can be useful for tracking uptime or for display on the frontend.
    startedAt: {
      type: Date,
      default: null, // Default to null when the bot is not running.
    },
  },
  {
    // This Mongoose option automatically adds two fields to your document:
    // `createdAt`: The timestamp when the document was first created.
    // `updatedAt`: The timestamp that is updated every time the document is saved.
    timestamps: true,
  }
);

// This compiles the schema into a model that you can use in your controllers.
// Mongoose will create a collection named 'bots' (lowercase, plural) in your database.
const Bot = mongoose.model('Bot', botSchema);

export default Bot;
