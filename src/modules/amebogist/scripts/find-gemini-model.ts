
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { execSync } from 'child_process';

async function findWorkingModel() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    console.log("🔍 Fetching model names via curl...");
    const output = execSync(`curl.exe -s https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`).toString();
    const data = JSON.parse(output);
    const models = data.models.map((m: any) => m.name.replace('models/', ''));

    console.log(`📋 Found ${models.length} models to test.`);
    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of models) {
        process.stdout.write(`🧪 Testing ${modelName}... `);
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: "You are an expert Nigerian journalist."
            });
            const result = await model.generateContent("Write a one sentence news headline in Pidgin English about AI in Lagos.");
            console.log("✅ WORKS!");
            console.log(`👉 SUGGESTION: Use '${modelName}'`);
            // Stop at first working model
            // process.exit(0); 
        } catch (err: any) {
            console.log(`❌ FAILED (${err.status || 'Error'})`);
        }
    }
}

findWorkingModel();
