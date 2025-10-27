import mongoose from "mongoose";

const exchangeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  apiKey: { type: String },
  secret: { type: String },
  baseUrl: { type: String }
});

export default mongoose.model("Exchange", exchangeSchema);
