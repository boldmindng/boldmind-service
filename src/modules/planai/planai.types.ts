import { PlanAIJobStatus, PlanAIJobType, SubscriptionTier } from '@prisma/client';

// ─── Subscription pricing (kobo) ─────────────────────────────────────────────
export const PLANAI_PRICING: Record<SubscriptionTier, number> = {
  FREE:       0,
  STARTER:    9_500_00,
  PRO:       25_000_00,
  AGENCY:    60_000_00,
  ENTERPRISE: 0,
};
export const ORDER_STATUSES = []


// ─── The 13 PlanAI core tool slugs ───────────────────────────────────────────
export const PLANAI_TOOL_SLUGS = [
  'social-media-manager',
  'ads-center',
  'brand-digital-home',
  'business-intelligence',
  'investor-readiness',
  'marketing-automation',
  'business-discovery',
  'ai-business-agent',
  'project-manager',
  'crm',
  'hr-payroll',
  'boldmind-fitness',
  'boldmind-marketplace',
] as const;

export type PlanAIToolSlug = (typeof PLANAI_TOOL_SLUGS)[number];

// ─── Tier → tool access ───────────────────────────────────────────────────────
export const TIER_TOOL_ACCESS: Record<SubscriptionTier, PlanAIToolSlug[] | 'all'> = {
  FREE:       ['social-media-manager', 'brand-digital-home', 'project-manager'],
  STARTER:    ['social-media-manager', 'brand-digital-home', 'project-manager',
               'business-intelligence', 'marketing-automation', 'business-discovery'],
  PRO:        'all',
  AGENCY:     'all',
  ENTERPRISE: 'all',
};

// ─── Job queue priority (lower = higher priority in BullMQ) ──────────────────
export const JOB_PRIORITY: Record<PlanAIJobType, number> = {
  BUSINESS_PLAN:       3,
  PITCH_DECK:          3,
  INVESTOR_DECK:       3,
  FINANCIAL_FORECAST:  4,
  STOREFRONT_SETUP:    4,
  BRANDING_PACKAGE:    5,
  MARKETING_CAMPAIGN:  5,
  CREDIBILITY_HUB:     6,
  ANALYTICS_REPORT:    7,
  EMAIL_SCRAPE:        8,
  HR_DOCS:             5,
  LEGAL:               5,
  OPERATIONS_DOC:      6,
};

// ─── Result shape returned from jobs ─────────────────────────────────────────
export interface PlanAIJobResult {
  jobId: string;
  type: PlanAIJobType;
  status: PlanAIJobStatus;
  output?: Record<string, unknown>;
  outputFileUrl?: string;
  error?: string;
  processingMs?: number;
}

// ─── PlanAI Score ─────────────────────────────────────────────────────────────
export interface PlanAIScore {
  userId: string;
  overall: number;
  dimensions: {
    digital_presence: number;
    marketing_reach: number;
    financial_clarity: number;
    operational_efficiency: number;
    growth_potential: number;
    investor_readiness: number;
  };
  recommendations: string[];
  toolsActivated: number;
  computedAt: string;
}

// ─── Platforms ────────────────────────────────────────────────────────────────
export const SOCIAL_PLATFORMS = [
  'instagram', 'tiktok', 'facebook', 'twitter', 'linkedin',
  'youtube', 'threads', 'bluesky', 'whatsapp_status',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// ─── Nigerian market constants ────────────────────────────────────────────────
export const NG_STATES = [
  'Lagos', 'Abuja', 'Kano', 'Rivers', 'Oyo', 'Kaduna', 'Anambra', 'Delta',
  'Ogun', 'Ondo', 'Enugu', 'Edo', 'Imo', 'Cross River', 'Plateau', 'Kwara',
  'Osun', 'Benue', 'Akwa Ibom', 'Abia', 'Ekiti', 'Ebonyi', 'Adamawa',
  'Nassarawa', 'Niger', 'Taraba', 'Kebbi', 'Sokoto', 'Zamfara', 'Jigawa',
  'Katsina', 'Yobe', 'Borno', 'Gombe', 'Bauchi', 'Bayelsa', 'Kogi',
] as const;

export const NG_LANGUAGES = ['english', 'pidgin', 'yoruba', 'igbo', 'hausa'] as const;
export type NgLanguage = (typeof NG_LANGUAGES)[number];

export const NG_FESTIVE_CAMPAIGNS = [
  'ramadan', 'sallah_eid', 'christmas', 'new_year',
  'back_to_school', 'valentines', 'independence_day', 'easter',
] as const;
export type NgFestiveCampaign = (typeof NG_FESTIVE_CAMPAIGNS)[number];

// ─── Industry bundles ─────────────────────────────────────────────────────────
export const INDUSTRY_BUNDLES = {
  restaurant: ['social-media-manager', 'brand-digital-home', 'crm', 'marketing-automation'],
  fashion:    ['social-media-manager', 'brand-digital-home', 'boldmind-marketplace', 'ads-center'],
  tech:       ['business-intelligence', 'investor-readiness', 'project-manager', 'crm'],
  beauty:     ['social-media-manager', 'ads-center', 'brand-digital-home', 'marketing-automation'],
  retail:     ['brand-digital-home', 'boldmind-marketplace', 'crm', 'hr-payroll'],
  agency:     ['ads-center', 'social-media-manager', 'crm', 'project-manager', 'business-discovery'],
} as const satisfies Record<string, PlanAIToolSlug[]>;

export type IndustryBundle = keyof typeof INDUSTRY_BUNDLES;

// ─── Nigerian PAYE bands (2024) ───────────────────────────────────────────────
export const NG_PAYE_BANDS = [
  { limit: 300_000,    rate: 0.07 },
  { limit: 600_000,    rate: 0.11 },
  { limit: 1_100_000,  rate: 0.15 },
  { limit: 1_600_000,  rate: 0.19 },
  { limit: 3_200_000,  rate: 0.21 },
  { limit: Infinity,   rate: 0.24 },
];
export const NG_PENSION_RATE = 0.08;
export const NG_NHF_RATE     = 0.025;