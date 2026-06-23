
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function testDirect() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY not found");
        return;
    }
    console.log("🚀 Testing direct SDK call with gemini-1.5-flash...");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    try {
        const result = await model.generateContent("Write a one sentence greeting in Nigerian Pidgin.");
        console.log("✅ SDK Response:", result.response.text());
    } catch (err: any) {
        console.error("💥 SDK Call Failed:");
        console.error("Status:", err.status);
        console.error("Message:", err.message);
        if (err.response) {
            console.error("Response Body:", await err.response.text());
        }
    }
}

testDirect();
