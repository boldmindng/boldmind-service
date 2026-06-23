
// import 'dotenv/config';
// import { GoogleGenerativeAI } from '@google/generative-ai';

// async function main() {
//     const apiKey = process.env['GEMINI_API_KEY'];
//     if (!apiKey) {
//         console.error("❌ GEMINI_API_KEY is missing");
//         return;
//     }

//     const genAI = new GoogleGenerativeAI(apiKey);

//     // The listModels call is often not directly available on the client in the way we expect
//     // but we can try to use a dummy generate call or fetch the models list via axios/fetch if needed
//     // Actually the SDK has a way to list models if we use the right version or call the API directly.

//     console.log("Listing models via direct API call to see what's available...");

//     try {
//         const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
//         const data = await response.json();

//         if (data?.models
//         ) {
//             console.log("Available models:");
//             data.models.forEach((m: any) => {
//                 console.log(`- ${m.name} (${m.displayName}) - Supported methods: ${m.supportedGenerationMethods.join(', ')}`);
//             });
//         } else {
//             console.log("No models found or error response:", JSON.stringify(data, null, 2));
//         }
//     } catch (error) {
//         console.error("Failed to list models:", error);
//     }
// }

// main();
