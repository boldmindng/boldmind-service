
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY not found");
        return;
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        // The SDK doesn't have a direct listModels, we need to use the REST API or discovery
        // Actually, we can just try the safest known model: 'gemini-pro'
        console.log("🔍 Testing 'gemini-pro'...");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("test");
        console.log("✅ 'gemini-pro' works!");
    } catch (err: any) {
        console.error("❌ 'gemini-pro' failed:", err.message);
    }

    try {
        console.log("🔍 Testing 'gemini-1.5-flash-latest'...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent("test");
        console.log("✅ 'gemini-1.5-flash-latest' works!");
    } catch (err: any) {
        console.error("❌ 'gemini-1.5-flash-latest' failed:", err.message);
    }
}

listModels();
