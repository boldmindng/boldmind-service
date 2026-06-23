// import 'dotenv/config';
// import mongoose from 'mongoose';
// import slugify from 'slugify';
// import { Post } from '../../schemas/post.schema';
// import { AiService } from '../services/ai.service';

// const MONGO_URI = process.env['MONGODB_URL'];
// const DB_NAME = process.env['MONGODB_DB_AMEBOGIST'] || 'amebogist_dev';

// // Connection handled in run()

// /* -----------------------------
//    CONFIG
// ------------------------------ */

// const START_DATE = new Date('2025-09-01T00:00:00.000Z');
// const END_DATE = new Date('2025-12-31T23:59:59.999Z');

// const AUTHOR = {
//     id: "680d35aa1f1bc1a71529aaa3",
//     name: "Amebo AI",
//     isVerified: true
// };

// const CATEGORIES = [
//     'ai-tech',
//     'creator',
//     'sports',
//     'politics',
//     'entertainment',
//     'trending',
//     'general'
// ];

// const TOPICS = [
//     "How Nigerian startups are scaling with AI",
//     "Best AI tools for Nigerian content creators",
//     "How to monetize YouTube in Nigeria 2025",
//     "AI regulation in Nigeria explained",
//     "How tech is transforming Lagos businesses",
//     "Top Nigerian tech founders to watch",
//     "How creators can earn in dollars from Nigeria",
//     "Future of fintech in West Africa",
//     "AI in Nigerian education sector",
//     "How small businesses use automation"
// ];

// /* -----------------------------
//    UTILITIES
// ------------------------------ */

// function randomDateBetween(start: Date, end: Date) {
//     return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
// }

// function calculateReadingTime(text: string) {
//     const words = text.split(/\s+/).length;
//     return Math.ceil(words / 200);
// }

// function randomViews() {
//     return Math.floor(Math.random() * 800) + 50;
// }

// /* -----------------------------
//    PART A: FIX OLD POSTS
// ------------------------------ */

// async function repairOldPosts() {
//     console.log("🔧 Repairing existing posts...");

//     const posts = await Post.find({});
//     console.log(`📊 Found ${posts.length} posts to repair.`);

//     for (const [index, post] of posts.entries()) {
//         console.log(`[${index + 1}/${posts.length}] Checking post: ${post.slug || post._id}`);
//         let updated = false;

//         if (!post.author) {
//             post.author = AUTHOR;
//             updated = true;
//         }

//         if (!post.content || typeof post.content === 'string') {
//             post.content = { pidgin: post.content as any };
//             updated = true;
//         }

//         if (!post.media) {
//             post.media = {
//                 gallery: []
//             };
//             updated = true;
//         }

//         if (!post.engagement) {
//             post.engagement = {
//                 views: randomViews(),
//                 likes: 0,
//                 shares: 0,
//                 commentsCount: 0,
//                 readingTime: calculateReadingTime(
//                     typeof post.content === 'object'
//                         ? post.content.pidgin || ''
//                         : ''
//                 )
//             };
//             updated = true;
//         }

//         if (!post.seo) {
//             post.seo = {
//                 metaTitle: post.title,
//                 metaDescription: post.excerpt,
//                 keywords: post.tags || []
//             };
//             updated = true;
//         }

//         if (!post.monetization) {
//             post.monetization = {
//                 hasAds: true,
//                 affiliateLinks: [],
//                 sponsored: false
//             };
//             updated = true;
//         }

//         if (!post.status) {
//             post.status = 'published';
//             updated = true;
//         }

//         if (!post.source) {
//             post.source = 'manual';
//             updated = true;
//         }

//         if (!post.publishedAt) {
//             post.publishedAt = post.createdAt;
//             updated = true;
//         }

//         if (!CATEGORIES.includes(post.category)) {
//             // Fix invalid category (likely an old ObjectId)
//             post.category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]!;
//             updated = true;
//         }

//         if (!['manual', 'ai', 'imported'].includes(post.source)) {
//             // Fix invalid source (e.g. 'newsdata')
//             post.source = 'imported';
//             updated = true;
//         }

//         if (updated) {
//             // Last minute check for excerpt length
//             if (post.excerpt && post.excerpt.length > 300) {
//                 post.excerpt = post.excerpt.substring(0, 297) + '...';
//                 updated = true;
//             }

//             await post.save();
//             console.log(`✅ Repaired: ${post.slug}`);
//         }
//     }

//     console.log("✔ Old posts repair complete\n");
// }

// /* -----------------------------
//    PART B: GENERATE 90 POSTS
// ------------------------------ */

// async function generate90Posts() {
//     console.log("🚀 Generating 90 posts...");

//     for (let i = 0; i < 90; i++) {
//         const topic = TOPICS[i % TOPICS.length]!;

//         console.log(`Generating (${i + 1}/90): ${topic}`);

//         interface AIResponse {
//             title: string;
//             excerpt: string;
//             content: string;
//             tags?: string[];
//         }

//         // Helper for AI generation with retries
//         const fetchWithRetry = async (t: string, retries = 10): Promise<AIResponse> => {
//             try {
//                 return await AIService.generateArticle({
//                     topic: t,
//                     style: 'amebo',
//                     language: 'pidgin',
//                     model: 'gemini'
//                 }) as AIResponse;
//             } catch (error: any) {
//                 const isRateLimited = error.message?.includes('429');
//                 const isServiceUnavailable = error.message?.includes('503') || error.status === 503;

//                 if ((isRateLimited || isServiceUnavailable) && retries > 0) {
//                     const waitTime = isServiceUnavailable ? 30000 : 20000; // 30s for 503, 20s for 429
//                     console.warn(`⚠️ ${isServiceUnavailable ? 'Service High Demand (503)' : 'Rate limited (429)'}. Waiting ${waitTime / 1000}s before retry... (${retries} left)`);
//                     await new Promise(r => setTimeout(r, waitTime));
//                     return fetchWithRetry(t, retries - 1);
//                 }
//                 throw error;
//             }
//         };

//         const aiData = await fetchWithRetry(topic);

//         let slug = slugify(aiData.title, { lower: true, strict: true });

//         // Prevent duplicate slug
//         let counter = 1;
//         while (await Post.findOne({ slug })) {
//             slug = `${slug}-${counter}`;
//             counter++;
//         }

//         const contentText = aiData.content;

//         const newPost = new Post({
//             slug,
//             title: aiData.title,
//             content: { pidgin: contentText },
//             excerpt: aiData.excerpt,
//             category: CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]!,
//             tags: aiData.tags || [],
//             author: AUTHOR,
//             media: {
//                 gallery: []
//             },
//             engagement: {
//                 views: randomViews(),
//                 likes: 0,
//                 shares: 0,
//                 commentsCount: 0,
//                 readingTime: calculateReadingTime(contentText)
//             },
//             seo: {
//                 metaTitle: aiData.title,
//                 metaDescription: aiData.excerpt,
//                 keywords: aiData.tags || []
//             },
//             monetization: {
//                 hasAds: true,
//                 affiliateLinks: [],
//                 sponsored: false
//             },
//             status: 'published',
//             isFeatured: Math.random() > 0.9,
//             source: 'ai',
//             publishedAt: randomDateBetween(START_DATE, END_DATE)
//         });

//         await newPost.save();

//         console.log(`✅ Saved: ${slug}`);

//         // Prevent API rate limit - Gemini Free is 15 RPM (1 req / 4s)
//         // We use 8s just to be safe and account for bursts or other activity
//         await new Promise(r => setTimeout(r, 8000));
//     }

//     console.log("\n🎉 90 Posts Created Successfully!");
// }

// /* -----------------------------
//    RUN
// ------------------------------ */

// async function run() {
//     try {
//         if (!MONGO_URI) {
//             console.error("❌ Missing AMEBOGIST_SERVICE_MONGODB_URL in .env");
//             process.exit(1);
//         }

//         console.log("🔌 Connecting to MongoDB:", MONGO_URI?.split('@').pop(), "Database:", DB_NAME);
//         await mongoose.connect(MONGO_URI!, { dbName: DB_NAME });
//         console.log("✅ Connected!");

//         // Add a small delay to ensure connection is ready for queries
//         await new Promise(r => setTimeout(r, 2000));

//         await repairOldPosts();
//         await generate90Posts();
//     } catch (error) {
//         console.error("💥 Fatal error in script:", error);
//     } finally {
//         await mongoose.disconnect();
//         console.log("🔌 Disconnected!");
//         process.exit();
//     }
// }

// run();
