import {
  Injectable, Logger, NotFoundException, BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../../database/prisma.service';
import { AiService } from '../../ai/ai.service';
import { NotificationService } from '../../notification/notification.service';
import { VibeCoderStatus } from '@prisma/client';

// ── Cohort seed (kept in sync with the frontend lib) ──────────────────────────
const CURRENT_COHORT_SEED = {
  name: 'Cohort 1 — The Founding Circle',
  slug: 'cohort-1',
  status: 'open',
  startDate: new Date('2026-07-07'),
  endDate: new Date('2027-01-07'),
  applicationDeadline: new Date('2026-06-15'),
  capacity: 30,
  priceMin: 3500000,  // ₦35,000 in kobo
  priceMax: 6000000,  // ₦60,000 in kobo
  description: 'The founding cohort of Vibe Coders. Build your first real product in 6 months.',
};

@Injectable()
export class VibeCodersService {
  private readonly logger = new Logger(VibeCodersService.name);
  private readonly PAYSTACK_SECRET: string;
  private readonly PAYSTACK_BASE = 'https://api.paystack.co';
  private readonly FRONTEND_URL: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly notify: NotificationService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.PAYSTACK_SECRET = this.config.get<string>('PAYSTACK_SECRET_KEY', '');
    this.FRONTEND_URL = this.config.get<string>('VIBECODERS_FRONTEND_URL', 'https://villagecircle.ng');
  }

  private paystackHeaders() {
    return { Authorization: `Bearer ${this.PAYSTACK_SECRET}`, 'Content-Type': 'application/json' };
  }

  // ── Ensure the current cohort exists in DB ─────────────────────────────────

  private async ensureCurrentCohort() {
    return this.prisma.vibeCoderCohort.upsert({
      where: { slug: CURRENT_COHORT_SEED.slug },
      update: {},
      create: CURRENT_COHORT_SEED,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPLY — Step 1
  // ═══════════════════════════════════════════════════════════════════════════

  async submitApplication(dto: {
    name: string;
    email: string;
    whatsapp: string;
    archetype: string;
    idea: string;
    obstacle: string;
    commitment: string;
    source?: string;
    referralCode?: string;
  }) {
    const existing = await this.prisma.vibeCoderApplicant.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('You have already applied. Check your email for next steps.');
    }

    const cohort = await this.ensureCurrentCohort();

    if (cohort.status === 'closed') {
      throw new BadRequestException('Applications are currently closed. Join our waitlist for the next cohort.');
    }

    const applicant = await this.prisma.vibeCoderApplicant.create({
      data: { ...dto, cohortId: cohort.id },
    });

    this.logger.log(`New Vibe Coders application: ${dto.email} — archetype: ${dto.archetype}`);

    // Send welcome email immediately with WhatsApp community link
    await this.notify.sendEmail({
      to: dto.email,
      subject: `You're in the community, ${dto.name.split(' ')[0]}! ⚡ Vibe Coders`,
      html: this.buildApplicationConfirmEmail(dto.name),
    }).catch(err => this.logger.warn(`Welcome email failed: ${err.message}`));

    this.eventEmitter.emit('vibecoders.applied', { applicantId: applicant.id, email: dto.email });

    return {
      success: true,
      message: 'Application received! Check your email for your WhatsApp community link.',
      applicantId: applicant.id,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSESSMENT — Step 2 (token-gated)
  // ═══════════════════════════════════════════════════════════════════════════

  async validateAssessmentToken(token: string) {
    const applicant = await this.prisma.vibeCoderApplicant.findUnique({
      where: { assessmentToken: token },
      select: { id: true, name: true, status: true, assessmentExpiry: true, assessedAt: true },
    });

    if (!applicant) throw new NotFoundException('Invalid or expired assessment link.');
    if (applicant.assessedAt) throw new BadRequestException('Assessment already submitted.');
    if (applicant.status !== VibeCoderStatus.SHORTLISTED) {
      throw new ForbiddenException('Your application is not currently in the assessment stage.');
    }
    if (applicant.assessmentExpiry && new Date() > applicant.assessmentExpiry) {
      throw new BadRequestException('This assessment link has expired. Contact us for a new one.');
    }

    return { valid: true, name: applicant.name };
  }

  async submitAssessment(token: string, answers: Record<string, string | number>) {
    const applicant = await this.prisma.vibeCoderApplicant.findUnique({
      where: { assessmentToken: token },
    });

    if (!applicant) throw new NotFoundException('Invalid or expired assessment link.');
    if (applicant.assessedAt) throw new BadRequestException('Assessment already submitted.');
    if (applicant.status !== VibeCoderStatus.SHORTLISTED) {
      throw new ForbiddenException('Assessment not available for your current application status.');
    }

    // AI-score the four dimensions
    const score = await this.scoreAssessment(applicant.name, answers);

    await this.prisma.vibeCoderApplicant.update({
      where: { id: applicant.id },
      data: {
        assessmentData: answers,
        assessmentScore: score,
        assessedAt: new Date(),
        status: VibeCoderStatus.ASSESSED,
      },
    });

    this.logger.log(`Assessment submitted by ${applicant.email} — overall score: ${score.overall}`);
    this.eventEmitter.emit('vibecoders.assessed', { applicantId: applicant.id });

    return { success: true, message: 'Assessment submitted. We will review and get back to you within 5 business days.' };
  }

  private async scoreAssessment(name: string, answers: Record<string, string | number>) {
    try {
      const result = await this.ai.generateJson<{
        mindset: number;
        clarity: number;
        learning: number;
        community: number;
        overall: number;
        summary: string;
        strengths: string[];
        concerns: string[];
      }>(
        `You are an expert evaluator for a 6-month coding mentorship program in Nigeria called Vibe Coders.
Score the applicant "${name}" across four dimensions (each 0–10) and an overall score (0–10).
Be fair, generous with growth mindset indicators, and grounded in Nigerian realities.
Return ONLY valid JSON:
{
  "mindset": <0-10>,
  "clarity": <0-10>,
  "learning": <0-10>,
  "community": <0-10>,
  "overall": <0-10>,
  "summary": "<2-sentence summary of the applicant>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "concerns": ["<concern 1>"]
}`,
        JSON.stringify(answers),
        { task: 'reasoning' },
      );
      return result.content;
    } catch {
      // Fallback: unscored — admin reviews manually
      return { mindset: 0, clarity: 0, learning: 0, community: 0, overall: 0, summary: 'AI scoring failed — please review manually.', strengths: [], concerns: [] };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COHORT
  // ═══════════════════════════════════════════════════════════════════════════

  async getCohortInfo() {
    const cohort = await this.ensureCurrentCohort();
    const now = new Date();
    const deadline = new Date(cohort.applicationDeadline);
    const start = new Date(cohort.startDate);

    let computedStatus = cohort.status;
    if (now > start) computedStatus = 'active';
    else if (now > deadline || cohort.enrolledCount >= cohort.capacity) computedStatus = 'closed';
    else computedStatus = 'open';

    return {
      ...cohort,
      status: computedStatus,
      spotsLeft: Math.max(0, cohort.capacity - cohort.enrolledCount),
      priceMin: cohort.priceMin / 100,
      priceMax: cohort.priceMax / 100,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async initializePayment(applicantId: string, dto: {
    paymentPath: 'one_time' | 'installment' | 'isa' | 'scholarship';
    amount: number;
    callbackUrl?: string;
  }) {
    const applicant = await this.prisma.vibeCoderApplicant.findUnique({
      where: { id: applicantId },
    });
    if (!applicant) throw new NotFoundException('Applicant not found.');
    if (applicant.status !== VibeCoderStatus.ACCEPTED) {
      throw new ForbiddenException('Only accepted applicants can proceed to payment.');
    }

    if (['isa', 'scholarship'].includes(dto.paymentPath)) {
      await this.prisma.vibeCoderApplicant.update({
        where: { id: applicantId },
        data: { paymentPath: dto.paymentPath },
      });
      return {
        paymentRequired: false,
        message: dto.paymentPath === 'scholarship'
          ? 'Your scholarship application has been noted. We will reach out within 3 days.'
          : 'Your ISA agreement will be sent to your email. No upfront payment needed.',
      };
    }

    const reference = `VC_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const amountKobo = dto.amount * 100;

    const { data: paystackResp } = await axios.post(
      `${this.PAYSTACK_BASE}/transaction/initialize`,
      {
        email: applicant.email,
        amount: amountKobo,
        reference,
        currency: 'NGN',
        callback_url: dto.callbackUrl ?? `${this.FRONTEND_URL}/vibecoders/apply/confirmation`,
        metadata: { applicantId, paymentPath: dto.paymentPath, cohortId: applicant.cohortId },
      },
      { headers: this.paystackHeaders() },
    );

    await this.prisma.vibeCoderApplicant.update({
      where: { id: applicantId },
      data: { paymentPath: dto.paymentPath, paystackRef: reference },
    });

    return { paymentRequired: true, authorizationUrl: paystackResp.data.authorization_url, reference };
  }

  async handlePaymentWebhook(rawBody: string, signature: string) {
    const hash = crypto.createHmac('sha512', this.PAYSTACK_SECRET).update(rawBody).digest('hex');
    if (hash !== signature) throw new ForbiddenException('Invalid webhook signature');

    const event = JSON.parse(rawBody);
    if (event.event !== 'charge.success') return { received: true };

    const { reference, metadata } = event.data;
    if (!metadata?.applicantId) return { received: true };

    await this.enrollApplicant(metadata.applicantId, metadata.cohortId, reference);
    return { received: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN
  // ═══════════════════════════════════════════════════════════════════════════

  async getApplicants(filters: {
    status?: VibeCoderStatus;
    cohortId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, cohortId, search, page = 1, limit = 30 } = filters;
    const where: any = {};
    if (status) where.status = status;
    if (cohortId) where.cohortId = cohortId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.vibeCoderApplicant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vibeCoderApplicant.count({ where }),
    ]);

    return { items, total, page, pageSize: limit };
  }

  async updateApplicantStatus(id: string, status: VibeCoderStatus, adminNotes?: string) {
    const applicant = await this.prisma.vibeCoderApplicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundException('Applicant not found.');

    const updateData: any = { status, ...(adminNotes ? { adminNotes } : {}) };

    if (status === VibeCoderStatus.SHORTLISTED && !applicant.assessmentToken) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      updateData.assessmentToken = token;
      updateData.assessmentExpiry = expiry;

      // Send assessment invitation email
      const assessmentUrl = `${this.FRONTEND_URL}/vibecoders/apply/assessment?token=${token}`;
      await this.notify.sendEmail({
        to: applicant.email,
        subject: `You've been shortlisted! Complete your assessment — Vibe Coders ⚡`,
        html: this.buildAssessmentInviteEmail(applicant.name, assessmentUrl),
      }).catch(err => this.logger.warn(`Assessment email failed: ${err.message}`));
    }

    if (status === VibeCoderStatus.ACCEPTED) {
      await this.notify.sendEmail({
        to: applicant.email,
        subject: `You're accepted into Vibe Coders Cohort 1! 🎉`,
        html: this.buildAcceptanceEmail(applicant.name),
      }).catch(err => this.logger.warn(`Acceptance email failed: ${err.message}`));
    }

    if (status === VibeCoderStatus.REJECTED) {
      await this.notify.sendEmail({
        to: applicant.email,
        subject: `Vibe Coders — Application Update`,
        html: this.buildRejectionEmail(applicant.name),
      }).catch(err => this.logger.warn(`Rejection email failed: ${err.message}`));
    }

    return this.prisma.vibeCoderApplicant.update({ where: { id }, data: updateData });
  }

  async enrollApplicant(applicantId: string, cohortId?: string, paystackRef?: string) {
    const applicant = await this.prisma.vibeCoderApplicant.findUnique({ where: { id: applicantId } });
    if (!applicant) throw new NotFoundException('Applicant not found.');

    const targetCohortId = cohortId ?? applicant.cohortId;

    await this.prisma.$transaction([
      this.prisma.vibeCoderApplicant.update({
        where: { id: applicantId },
        data: {
          status: VibeCoderStatus.ENROLLED,
          enrolledAt: new Date(),
          ...(targetCohortId ? { cohortId: targetCohortId } : {}),
          ...(paystackRef ? { paystackRef } : {}),
        },
      }),
      ...(targetCohortId ? [
        this.prisma.vibeCoderCohort.update({
          where: { id: targetCohortId },
          data: { enrolledCount: { increment: 1 } },
        }),
      ] : []),
    ]);

    await this.notify.sendEmail({
      to: applicant.email,
      subject: `Welcome to Vibe Coders Cohort 1! You're officially in 🚀`,
      html: this.buildEnrollmentEmail(applicant.name),
    }).catch(err => this.logger.warn(`Enrollment email failed: ${err.message}`));

    this.eventEmitter.emit('vibecoders.enrolled', { applicantId });
    this.logger.log(`${applicant.email} enrolled in cohort ${targetCohortId}`);

    return { success: true, message: `${applicant.name} enrolled successfully.` };
  }

  async getAdminStats() {
    const [byStatus, totalApplicants, cohort] = await Promise.all([
      this.prisma.vibeCoderApplicant.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.vibeCoderApplicant.count(),
      this.ensureCurrentCohort(),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map(s => [s.status, s._count.id])
    );

    return {
      total: totalApplicants,
      byStatus: statusMap,
      cohort: {
        capacity: cohort.capacity,
        enrolled: cohort.enrolledCount,
        spotsLeft: Math.max(0, cohort.capacity - cohort.enrolledCount),
        fillRate: Math.round((cohort.enrolledCount / cohort.capacity) * 100),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  private buildApplicationConfirmEmail(name: string) {
    const firstName = name.split(' ')[0];
    return `
<div style="background:#0A0B07;color:#EDE8DC;font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;">
  <h2 style="color:#C9922A;margin-bottom:8px;">⚡ You're in the community, ${firstName}!</h2>
  <p>Your Vibe Coders application has been received. We go through applications carefully, so give us a few days.</p>
  <p>In the meantime, <strong>join the free WhatsApp community</strong> — it's where the energy is:</p>
  <a href="https://chat.whatsapp.com/vibecoders" style="display:inline-block;background:#C9922A;color:#0A0B07;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;margin:16px 0;">Join WhatsApp Community →</a>
  <p style="color:rgba(237,232,220,0.5);font-size:13px;margin-top:32px;">VillageCircle · villagecircle.ng</p>
</div>`;
  }

  private buildAssessmentInviteEmail(name: string, url: string) {
    const firstName = name.split(' ')[0];
    return `
<div style="background:#0A0B07;color:#EDE8DC;font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;">
  <h2 style="color:#C9922A;">You've been shortlisted, ${firstName} ⚡</h2>
  <p>Out of everyone who applied, we shortlisted you for the deep assessment. This is Step 2 — a set of questions designed to help us understand how you think, not just what you know.</p>
  <p>It takes about 20–30 minutes. Be honest. There are no wrong answers.</p>
  <p style="color:rgba(237,232,220,0.5);">This link expires in 7 days.</p>
  <a href="${url}" style="display:inline-block;background:#C9922A;color:#0A0B07;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;margin:16px 0;">Begin Assessment →</a>
  <p style="color:rgba(237,232,220,0.5);font-size:13px;margin-top:32px;">VillageCircle · villagecircle.ng</p>
</div>`;
  }

  private buildAcceptanceEmail(name: string) {
    const firstName = name.split(' ')[0];
    return `
<div style="background:#0A0B07;color:#EDE8DC;font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;">
  <h2 style="color:#C9922A;">You're accepted, ${firstName} 🎉</h2>
  <p>We reviewed your application and assessment and we want you in Vibe Coders Cohort 1.</p>
  <p>Log in to your portal to complete your enrollment and choose your payment path:</p>
  <a href="https://villagecircle.ng/vibecoders/portal" style="display:inline-block;background:#C9922A;color:#0A0B07;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;margin:16px 0;">Complete Enrollment →</a>
  <p style="color:rgba(237,232,220,0.5);font-size:13px;margin-top:32px;">VillageCircle · villagecircle.ng</p>
</div>`;
  }

  private buildRejectionEmail(name: string) {
    const firstName = name.split(' ')[0];
    return `
<div style="background:#0A0B07;color:#EDE8DC;font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;">
  <h2 style="color:#C9922A;">Vibe Coders — Cohort 1 Update</h2>
  <p>Hi ${firstName}, thank you for applying to Vibe Coders Cohort 1.</p>
  <p>After careful review, we won't be able to include you in this cohort. This is not a judgement of your potential — cohorts have very limited spots and we had to make hard calls.</p>
  <p>You remain part of the free community. We run cohorts quarterly and we encourage you to apply again.</p>
  <p style="color:rgba(237,232,220,0.5);font-size:13px;margin-top:32px;">VillageCircle · villagecircle.ng</p>
</div>`;
  }

  private buildEnrollmentEmail(name: string) {
    const firstName = name.split(' ')[0];
    return `
<div style="background:#0A0B07;color:#EDE8DC;font-family:Georgia,serif;padding:40px;max-width:600px;margin:0 auto;">
  <h2 style="color:#C9922A;">Welcome to the Founding Circle, ${firstName} 🚀</h2>
  <p>You are officially enrolled in <strong>Vibe Coders Cohort 1</strong>. The program starts <strong>July 7, 2026</strong>.</p>
  <p>Access your portal to see the curriculum, meet your cohort, and prepare:</p>
  <a href="https://villagecircle.ng/vibecoders/portal" style="display:inline-block;background:#C9922A;color:#0A0B07;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;margin:16px 0;">Open Student Portal →</a>
  <p style="color:rgba(237,232,220,0.5);font-size:13px;margin-top:32px;">VillageCircle · villagecircle.ng</p>
</div>`;
  }
}
