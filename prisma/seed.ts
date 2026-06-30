/**
 * BoldMind Seed Script
 *
 * Usage (development):
 *   npx ts-node -r tsconfig-paths/register prisma/seed.ts
 *
 * Usage (production) — set DATABASE_URL env var first:
 *   DATABASE_URL="postgresql://..." npx ts-node -r tsconfig-paths/register prisma/seed.ts --env=prod
 *
 * What it seeds:
 *   1. Super admin user
 *   2. Demo users for each ecosystem role
 *   3. FREE subscriptions for demo users (one per product)
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local first, then .env (same order as NestJS ConfigModule)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const SALT_ROUNDS = 12;

const isProd = process.argv.includes('--env=prod');

async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

function referralCode() {
  return crypto.randomBytes(6).toString('hex');
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const ADMIN_USER = {
  email: 'admin@boldmind.ng',
  name: 'BoldMind Admin',
  password: isProd ? process.env['SEED_ADMIN_PASSWORD'] || 'ChangeMe@2025!' : 'Admin@123!',
  role: 'super_admin' as const,
};

const DEMO_USERS = isProd ? [] : [
  {
    email: 'founder@boldmind.ng',
    name: 'Demo Founder',
    password: 'Demo@123!',
    role: 'founder' as const,
    ecosystemRole: 'founder' as const,
    digitalMaturity: 'high' as const,
    activeProducts: ['planai-suite', 'boldmind-os', 'skillgig'],
  },
  {
    email: 'student@boldmind.ng',
    name: 'Demo Student',
    password: 'Demo@123!',
    role: 'student' as const,
    ecosystemRole: 'student' as const,
    digitalMaturity: 'low' as const,
    activeProducts: ['educenter', 'amebogist'],
  },
  {
    email: 'creator@boldmind.ng',
    name: 'Demo Creator',
    password: 'Demo@123!',
    role: 'creator' as const,
    ecosystemRole: 'creator' as const,
    digitalMaturity: 'medium' as const,
    activeProducts: ['amebogist', 'boldmind-tools'],
  },
  {
    email: 'hustler@boldmind.ng',
    name: 'Demo Hustler',
    password: 'Demo@123!',
    role: 'hustler' as const,
    ecosystemRole: 'hustler' as const,
    digitalMaturity: 'medium' as const,
    activeProducts: ['boldmind-tools', 'skillgig', 'naija-fit'],
  },
];

// ─── Seed Functions ───────────────────────────────────────────────────────────

async function seedAdmin() {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_USER.email } });
  if (existing) {
    console.log(`⚡ Admin already exists: ${ADMIN_USER.email}`);
    return existing;
  }

  const passwordHash = await hashPassword(ADMIN_USER.password);
  const user = await prisma.user.create({
    data: {
      email: ADMIN_USER.email,
      name: ADMIN_USER.name,
      passwordHash,
      role: ADMIN_USER.role,
      isVerified: true,
      emailVerifiedAt: new Date(),
      provider: 'email',
      permissions: ['*'],
      profile: {
        create: {
          displayName: ADMIN_USER.name,
          referralCode: referralCode(),
          onboardingDone: true,
        },
      },
    },
  });

  console.log(`✅ Created admin: ${user.email}`);
  return user;
}

async function seedDemoUsers() {
  for (const demo of DEMO_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: demo.email } });
    if (existing) {
      console.log(`⚡ Demo user exists: ${demo.email}`);
      continue;
    }

    const passwordHash = await hashPassword(demo.password);
    const user = await prisma.user.create({
      data: {
        email: demo.email,
        name: demo.name,
        passwordHash,
        role: demo.role,
        ecosystemRole: demo.ecosystemRole,
        digitalMaturity: demo.digitalMaturity,
        isVerified: true,
        emailVerifiedAt: new Date(),
        provider: 'email',
        permissions: [],
        profile: {
          create: {
            displayName: demo.name,
            referralCode: referralCode(),
            onboardingDone: true,
            activeProducts: demo.activeProducts,
          },
        },
        ...(demo.ecosystemRole === 'student' ? { studyStreak: { create: {} } } : {}),
      },
    });

    // Add FREE subscriptions for their active products
    for (const productSlug of demo.activeProducts) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          productSlug,
          planName: 'Free',
          amountNGN: 0,
          interval: 'month',
          tier: 'FREE',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    console.log(`✅ Created demo user: ${user.email} (${demo.ecosystemRole})`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 Starting BoldMind seed (${isProd ? 'PRODUCTION' : 'DEVELOPMENT'})...\n`);

  await seedAdmin();
  await seedDemoUsers();

  console.log('\n✅ Seed complete!\n');
  console.log('Default credentials:');
  console.log(`  Admin: ${ADMIN_USER.email} / ${isProd ? '[from SEED_ADMIN_PASSWORD]' : ADMIN_USER.password}`);
  if (!isProd) {
    for (const u of DEMO_USERS) {
      console.log(`  ${u.ecosystemRole}: ${u.email} / ${u.password}`);
    }
  }
  console.log('');
}

main()
  .catch(e => { console.error('Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
