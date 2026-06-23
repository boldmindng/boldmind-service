
import 'dotenv/config';
import mongoose from 'mongoose';

async function test() {
    console.log("🧪 Testing MongoDB connection...");
    const uri = process.env.MONGODB_URL;
    if (!uri) {
        console.error("❌ MONGODB_URL not found");
        return;
    }
    try {
        await mongoose.connect(uri);
        console.log("✅ Successfully connected to MongoDB!");
    } catch (err) {
        console.error("❌ Connection failed:", err);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected.");
    }
}

test();
