
import 'dotenv/config';
import mongoose from 'mongoose';
import { PostSchema } from '../schemas/post.schema';

async function check() {
    console.log("🔍 Checking MongoDB for generated posts...");
    const Post = mongoose.model('Post', PostSchema);
    await mongoose.connect(process.env.MONGODB_URL || '');
    const count = await Post.countDocuments();
    console.log('Post count:', count);
    
    // Get last 5 slugs
    const lastPosts = await Post.find({}, 'slug createdAt').sort({ createdAt: -1 }).limit(5);
    console.log('Last 5 posts:', lastPosts.map(p => ({ slug: p.slug, at: p.createdAt })));
    process.exit();
}

check();
