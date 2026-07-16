import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import compression = require("compression");
import morgan = require("morgan");
import cookieParser = require("cookie-parser");
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http.exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { validateDatabaseEnvVars } from "./database/validate-env";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const { valid, missing } = validateDatabaseEnvVars();
  if (!valid) {
    logger.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log", "debug"],
  });

  const configService = app.get(ConfigService);
  const PORT = configService.get<number>("PORT", 4001);
  const NODE_ENV = configService.get<string>("NODE_ENV", "development");

  // ── Security ───────────────────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  app.enableCors({
    origin: [
      // Core domains
      "https://boldmind.ng",
      "https://planai.boldmind.ng",
      "https://marketplace.boldmind.ng",
      // Awareness pillar
      "https://amebogist.ng",
      // Education pillar
      "https://educenter.com.ng",
      // Conviction pillar
      "https://villagecircle.ng",
      // Local dev
      ...(NODE_ENV !== "production"
        ? [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            "http://localhost:3003",
            "http://localhost:3004",
          ]
        : []),
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // FIX (2026-07-15): frontend sends 'x-app-domain' on cross-domain calls
    // (e.g. /auth/refresh from boldmind.ng) but it was missing from this
    // list entirely — the browser's preflight OPTIONS check compares the
    // literal header names the client asks for against this list, and
    // 'X-App-ID' is not the same header as 'x-app-domain'. Any custom
    // header sent by any frontend must be explicitly listed here or the
    // preflight fails before the real request is ever sent.
    //
    // FIX (2026-07-17): @boldmindng/api-client's apiFetch()/createClient()
    // stamp every outgoing request with 'x-correlation-id' (see client.ts
    // generateCorrelationId()) for distributed tracing. That header was
    // never added here, so every preflight — including the one in front of
    // POST /auth/refresh — failed with:
    //   "Request header field x-correlation-id is not allowed by
    //    Access-Control-Allow-Headers in preflight response."
    // Any header client.ts sets must be mirrored in this list.
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-App-ID",
      "X-Request-ID",
      "x-app-domain",
      "x-correlation-id",
    ],
    // Preflight responses are cached by the browser for this many seconds —
    // reduces repeated OPTIONS round-trips for the same origin/header combo.
    maxAge: 86400,
  });

  app.use(cookieParser());
  app.use(compression());
  app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

  // ── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix("api/v1", { exclude: ["health", "/"] });

  // ── Global pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters & interceptors ──────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  // ── Swagger ────────────────────────────────────────────────────────────────
  if (
    NODE_ENV !== "production" ||
    configService.get("SWAGGER_ENABLED") === "true"
  ) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("BoldmindNG API")
      .setDescription(
        `BoldmindNG Ecosystem — 32+ products across 4 pillars.\n\n` +
          `**Flywheel:** AmeboGist (Awareness) → VillageCircle (Conviction) → EduCenter (Education) → BoldmindNG/PlanAI (Enablement)\n\n` +
          `Base URL: \`https://api.boldmind.ng/api/v1\``,
      )
      .setVersion("2.2.2")
      .setContact(
        "BoldmindNG Engineering",
        "https://boldmind.ng",
        "dev@boldmind.ng",
      )
      .setLicense("Private", "https://boldmind.ng")
      .addServer("https://api.boldmind.ng", "Production")
      .addServer("http://localhost:4001", "Local Development")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "BoldmindNG JWT issued by /api/v1/auth/login",
        },
        "access-token",
      )

      // ── Infrastructure ────────────────────────────────────────
      .addTag("Health", "Railway health check — GET /health")
      .addTag(
        "Auth",
        "Authentication, JWT, Google OAuth, cross-domain SSO relay",
      )
      .addTag(
        "Users",
        "User profile, wallet, notifications, referrals, subscriptions",
      )
      .addTag(
        "Payments",
        "Paystack checkout, webhook processing, subscription management",
      )
      .addTag(
        "Notifications",
        "Email (Resend), SMS (Termii), WhatsApp, Push, in-app",
      )
      .addTag(
        "Media",
        "Cloudflare R2 uploads — images, logos, documents, videos",
      )
      .addTag(
        "Analytics",
        "Cross-product event tracking and aggregated reporting",
      )
      .addTag("Admin", "Admin dashboard — users, revenue, subscriptions, flags")
      .addTag(
        "Hub",
        "BoldmindNG Hub — ecosystem gateway, community feed, builder dashboard",
      )

      // ── Enablement pillar: PlanAI Suite (boldmind.ng) ─────────
      .addTag(
        "PlanAI / Suite",
        "PlanAI access tiers, tool enablement, suite dashboard — boldmind.ng",
      )
      .addTag(
        "PlanAI / Social Media",
        "AI caption & image generation, multi-platform scheduling (9 platforms), DM automation — planai.boldmind.ng/social",
      )
      .addTag(
        "PlanAI / Ads Center",
        "Meta, Google, TikTok ad campaign management with Naira billing — planai.boldmind.ng/ads",
      )
      .addTag(
        "PlanAI / Brand Home",
        "AI logo generation (FLUX), brand kit, online store, portfolio — planai.boldmind.ng/brand",
      )
      .addTag(
        "PlanAI / Biz Intelligence",
        "AI business plans, financial forecasting, unified analytics — planai.boldmind.ng/intelligence",
      )
      .addTag(
        "PlanAI / Investor Kit",
        "SAFE notes, pitch decks, data room, cap table, SEC Nigeria compliance — planai.boldmind.ng/investor",
      )
      .addTag(
        "PlanAI / Marketing Auto",
        "Email drips, WhatsApp broadcasts, SMS campaigns, lead nurturing — planai.boldmind.ng/marketing",
      )
      .addTag(
        "PlanAI / Biz Directory",
        "Nigerian business discovery, B2B contact scraping, LinkedIn enrichment — planai.boldmind.ng/directory",
      )
      .addTag(
        "PlanAI / Biz Agent",
        "Autonomous AI business agent — bookings, DMs, invoice follow-up — planai.boldmind.ng/agent",
      )
      .addTag(
        "PlanAI / Project Manager",
        "Workspaces, projects, tasks, Pomodoro, knowledge graph — planai.boldmind.ng/projects",
      )
      .addTag(
        "PlanAI / CRM",
        "Lead pipeline, contact history, WhatsApp CRM, deal tracking — planai.boldmind.ng/crm",
      )
      .addTag(
        "PlanAI / HR & Payroll",
        "Staff onboarding, PAYE payroll, pension, payslip generation — planai.boldmind.ng/hr",
      )
      .addTag(
        "PlanAI / Fitness Center",
        "Nigerian meal database, workout plans, AI coach, corporate wellness — planai.boldmind.ng/fitness",
      )
      .addTag(
        "PlanAI / Marketplace",
        "Services + digital products two-sided marketplace, Paystack escrow — marketplace.boldmind.ng",
      )

      // ── Awareness pillar: AmeboGist (amebogist.ng) ─────────────
      .addTag(
        "AmeboGist / Posts",
        "Pidgin English articles — CRUD, reactions, comments, trending — amebogist.ng",
      )
      .addTag("AmeboGist / Categories", "Content categories and tag management")
      .addTag(
        "AmeboGist / RSS",
        "RSS feed for content syndication — amebogist.ng/rss",
      )
      .addTag("AmeboGist / Creator", "Creator dashboard, stats, earnings")

      // ── Education pillar: EduCenter (educenter.com.ng) ─────────
      .addTag(
        "EduCenter / Exam Prep",
        "JAMB, WAEC, NECO, GCE, Post-UTME questions via ALOC API — educenter.com.ng",
      )
      .addTag(
        "EduCenter / CBT",
        "CBT simulator sessions, scoring, answer review",
      )
      .addTag(
        "EduCenter / Progress",
        "Study streaks, XP, subject performance, leaderboard",
      )
      .addTag(
        "EduCenter / Courses",
        "Course library, lesson content, enrollments, LMS",
      )
      .addTag(
        "EduCenter / Schools",
        "School management portal, bulk student enrollment, teacher dashboard",
      )

      // ── Conviction pillar: VillageCircle (villagecircle.ng) ────
      .addTag(
        "VillageCircle / Waitlist",
        "Unified waitlist for all 30 VillageCircle concepts — villagecircle.ng",
      )
      .addTag(
        "VillageCircle / VibeCoders",
        "Coding cohort — applications, psychology assessment, enrollment, portal",
      )
      .addTag(
        "VillageCircle / KoloAI",
        "Digital Ajo/Esusu thrift savings groups with AI default prediction",
      )
      .addTag(
        "VillageCircle / BorderlessRemit",
        "Diaspora remittance rate comparison and rate alerts",
      )
      .addTag(
        "VillageCircle / ReceiptGenius",
        "VAT-compliant invoice and receipt generation, WhatsApp delivery",
      )
      .addTag(
        "VillageCircle / FarmGate",
        "Direct farmer-to-buyer produce marketplace",
      )
      .addTag(
        "VillageCircle / NaijaGig",
        "Artisan and freelancer gig marketplace by LGA",
      )
      .addTag(
        "VillageCircle / Skill2Cash",
        "Video skill profiles — 30-second showcase for artisans",
      )
      .addTag(
        "VillageCircle / AfroHustle",
        "Nigerian side-hustle blueprints and business playbooks",
      )
      .addTag(
        "VillageCircle / SafeAI",
        "AI-powered security incident reporting and officer dispatch",
      )
      .addTag(
        "VillageCircle / Concepts",
        "All remaining concept waitlists — PowerAlert, FarmGate, AfroCopy, etc.",
      )

      // ── AI / Automation (cross-cutting) ────────────────────────
      .addTag(
        "AI",
        "OpenAI GPT-4o, Groq, Gemini, fal.ai FLUX — generation, job status, trend feed",
      )
      .addTag(
        "Automation",
        "n8n workflow triggers, BullMQ job management, campaign scheduling",
      )

      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: "alpha",
        operationsSorter: "alpha",
        docExpansion: "none", // collapsed by default — 32+ tags would be overwhelming open
        filter: true, // enable tag/operation search box
        tryItOutEnabled: NODE_ENV !== "production",
      },
      customSiteTitle: "BoldmindNG API Docs",
    });

    logger.log(`📚 Swagger docs: http://localhost:${PORT}/api/docs`);
  }

  await app.listen(PORT, "0.0.0.0");
  logger.log(`🚀 BoldmindNG API running on port ${PORT} [${NODE_ENV}]`);
}

bootstrap();
