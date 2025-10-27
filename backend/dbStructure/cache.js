// File: backend/dbStructure/cache.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const cacheSchema = new Schema({
    key: {
        type: String,
        required: true,
        unique: true,
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }, // This sets up a TTL index for auto-deletion
    },
}, { timestamps: true });

export default model("Cache", cacheSchema);
