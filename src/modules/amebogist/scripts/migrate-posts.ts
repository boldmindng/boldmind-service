
import 'dotenv/config';
import mongoose from 'mongoose';

async function migrateComments() {
    console.log('🚀 Starting Comment Migration...');

    const uri = process.env['AMEBOGIST_SERVICE_MONGODB_URL'];
    if (!uri) {
        console.error('❌ AMEBOGIST_SERVICE_MONGODB_URL not found in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection failed');
        }

        const commentsCollection = db.collection('comments');
        const comments = await commentsCollection.find({}).toArray();

        console.log(`Found ${comments.length} comments to process...`);

        let updatedCount = 0;

        for (const comment of comments) {
            const update: any = {};

            if (comment.userId && !comment.user) {
                update.user = {
                    id: comment.userId,
                    name: "Anonymous",
                    avatar: null,
                    isAuthor: false
                };
            }

            if ((comment.likes || comment.dislikes) && !comment.reactions) {
                update.reactions = {
                    like: comment.likes?.length || 0,
                    love: 0,
                    laugh: 0,
                    angry: comment.dislikes?.length || 0
                };
            }

            if (Object.keys(update).length > 0) {
                await commentsCollection.updateOne(
                    { _id: comment._id },
                    { $set: update }
                );
                updatedCount++;
            }
        }

        console.log(`✨ Comments migrated successfully. Updated ${updatedCount} documents.`);
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected');
        process.exit(0);
    }
}

migrateComments();
