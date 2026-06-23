
import 'dotenv/config';
import 'reflect-metadata';
import mongoose from 'mongoose';
import slugify from 'slugify';
import { Post } from '../schemas/post.schema';
import { GeminiProvider } from '../../ai/providers/gemini.provider';

async function testProviderDirect() {
    console.log("🚀 Starting Direct Provider Test...");
    const mongoUri = process.env.MONGODB_URL;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!mongoUri || !apiKey) {
        console.error("❌ Missing env variables");
        return;
    }

    try {
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        // Mock ConfigService for the provider
        const mockConfig = {
            get: (key: string) => {
                if (key === 'GEMINI_API_KEY') return apiKey;
                return process.env[key];
            }
        } as any;

        const gemini = new GeminiProvider(mockConfig);
        console.log("🤖 Calling GeminiProvider.chat with gemma-3-27b-it...");
        
        const systemPrompt = "You are an expert Nigerian journalist. Write in Pidgin English.";
        const userPrompt = "Write a news article titled 'AI in Naija 2025'. Include a short excerpt and content body. Format as JSON with fields {title, excerpt, content}.";

        const response = await gemini.chat(systemPrompt, userPrompt, {
            model: 'gemma-3-27b-it'
        });

        console.log("✅ AI Response received. Length:", response.content.length);
        console.log("🤖 Raw content snippet:", response.content.substring(0, 100));

        const aiData = JSON.parse(response.content.match(/\{[\s\S]*\}/)?.[0] || response.content);
        
        const slug = slugify(aiData.title, { lower: true, strict: true });
        const newPost = new Post({
            slug,
            title: aiData.title,
            content: { pidgin: aiData.content },
            excerpt: aiData.excerpt,
            category: 'ai-tech',
            author: { id: "test-id", name: "Tester", isVerified: true },
            status: 'published',
            source: 'ai'
        });

        await newPost.save();
        console.log(`✅ Post saved successfully: ${slug}`);

    } catch (err: any) {
        console.error("💥 Test failed:", err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected.");
    }
}

testProviderDirect();
