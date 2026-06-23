
import 'dotenv/config';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

async function backup() {
    console.log('🚀 Starting Amebogist Database Backup...');

    const uri = process.env['AMEBOGIST_SERVICE_MONGODB_URL'];
    if (!uri) {
        console.error('❌ MONGODB_URI/AMEBOGIST_SERVICE_MONGODB_URL not found in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log('✅ Connected to MongoDB');

        const collections = await mongoose.connection.db?.listCollections().toArray();
        if (!collections) {
            console.log('⚠️ No collections found.');
            process.exit(0);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(process.cwd(), 'backups', timestamp);

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        console.log(`📂 Backup directory: ${backupDir}`);

        for (const collectionInfo of collections) {
            const collectionName = collectionInfo.name;
            const data = await mongoose.connection.db?.collection(collectionName).find({}).toArray();

            if (data) {
                const filePath = path.join(backupDir, `${collectionName}.json`);
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                console.log(`✔ Backed up ${collectionName}: ${data.length} documents`);
            }
        }

        console.log('✨ Backup completed successfully!');
    } catch (error) {
        console.error('❌ Backup failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

backup();
