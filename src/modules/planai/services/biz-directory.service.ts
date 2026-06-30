import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { PrismaService } from "../../../database/prisma.service";
import { RedisService } from "../../../database/redis.service";
import { AiService } from "../../ai/ai.service";
import { QUEUES, JOBS } from "../../../common/constants/queues";
import { SearchBusinessesDto, FindContactsDto } from "../dto/all-planai.dto";

// ─── Exported types ───────────────────────────────────────────────────────────
// Must be exported so TypeScript can name these types in the public method
// signatures of BizDirectoryService without a TS4055 "cannot be named" error.

export interface HunterEmailResult {
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  confidence: number;
  verified: boolean;
}

export interface EmailVerifyResult {
  email: string;
  valid: boolean;
  score?: number;
  reason: string;
  checks?: { format: boolean; mxRecord: boolean };
  note?: string;
}

export interface LeadList {
  id: string;
  userId: string;
  name: string;
  description: string;
  contactIds: string[];
  createdAt: string;
}

export interface ExportResult {
  data: string;
  filename: string;
  mimeType: string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class BizDirectoryService {
  private readonly logger = new Logger(BizDirectoryService.name);

  private readonly hunterApiKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.AI_GENERATION) private readonly aiQueue: Queue,
  ) {
    this.hunterApiKey = this.config.get<string>("HUNTER_IO_API_KEY", "");
  }

  // ─── Business search ──────────────────────────────────────────────────────

  async search(
    userId: string,
    dto: SearchBusinessesDto,
  ): Promise<Record<string, unknown>> {
    const cacheKey = `directory:search:${Buffer.from(JSON.stringify(dto)).toString("base64").slice(0, 30)}`;

    const cached = await this.redis.cacheGet(cacheKey);
    if (cached) {
      await this.logUsage(userId);
      return JSON.parse(cached) as Record<string, unknown>;
    }

    await this.logActivity(userId, "directory.search", {
      keyword: dto.keyword,
      industry: dto.industry,
      state: dto.state,
    });
    await this.logUsage(userId);

    const result: Record<string, unknown> = {
      results: [],
      meta: {
        total: 0,
        page: dto.page ?? 1,
        limit: dto.limit ?? 20,
        query: {
          keyword: dto.keyword,
          industry: dto.industry,
          state: dto.state,
        },
      },
      setupNote:
        "Connect MongoDB businesses collection and CAC registry to enable live listings.",
    };

    await this.redis.cacheSet(cacheKey, JSON.stringify(result), 300);
    return result;
  }

  // ─── Contact / email discovery via Hunter.io ──────────────────────────────

  async findContacts(
    userId: string,
    dto: FindContactsDto,
  ): Promise<Record<string, unknown>> {
    const cacheKey = `directory:contacts:${dto.company}:${dto.jobTitle ?? "any"}`;

    const cached = await this.redis.cacheGet(cacheKey);
    if (cached) {
      await this.logUsage(userId);
      return JSON.parse(cached) as Record<string, unknown>;
    }

    let contacts: HunterEmailResult[] = [];
    let source = "none";

    if (this.hunterApiKey) {
      try {
        const { data } = await firstValueFrom(
          this.http.get("https://api.hunter.io/v2/domain-search", {
            params: {
              company: dto.company,
              api_key: this.hunterApiKey,
              limit: 20,
              ...(dto.jobTitle
                ? { seniority: this.mapJobTitleToSeniority(dto.jobTitle) }
                : {}),
            },
          }),
        );

        const hunterData = data as {
          data: {
            emails: Array<{
              value: string;
              first_name: string;
              last_name: string;
              position: string;
              confidence: number;
              verification?: { status: string };
            }>;
          };
        };

        contacts = (hunterData.data?.emails ?? []).map((e) => ({
          email: e.value,
          firstName: e.first_name ?? "",
          lastName: e.last_name ?? "",
          position: e.position ?? "",
          confidence: e.confidence ?? 0,
          verified: e.verification?.status === "valid",
        }));
        source = "hunter";
      } catch (err) {
        this.logger.warn(
          `Hunter.io lookup failed for ${dto.company}: ${String(err)}`,
        );
      }
    }

    if (contacts.length === 0) {
      const scrapeJob = await this.aiQueue.add(
        JOBS.AI.EMAIL_SCRAPE,
        {
          jobId: `scrape_${Date.now()}`,
          userId,
          type: "EMAIL_SCRAPE",
          input: {
            company: dto.company,
            jobTitle: dto.jobTitle,
            limit: 20,
            userId,
          },
        },
        { attempts: 2 },
      );
      source = "queued_scrape";
      await this.logActivity(userId, "directory.scrape_queued", {
        company: dto.company,
        bullJobId: scrapeJob.id,
      });
    }

    const result: Record<string, unknown> = {
      company: dto.company,
      contacts,
      total: contacts.length,
      source,
      ...(source === "queued_scrape"
        ? {
            message:
              "Contact discovery queued. Results available in 2-3 minutes. Refresh to see results.",
          }
        : {}),
    };

    if (contacts.length > 0) {
      await this.redis.cacheSet(cacheKey, JSON.stringify(result), 3600);
    }

    await this.logActivity(userId, "directory.contact_lookup", {
      company: dto.company,
      found: contacts.length,
      source,
    });
    await this.logUsage(userId);

    return result;
  }

  // ─── Single email verification ────────────────────────────────────────────

  async verifyEmail(userId: string, email: string): Promise<EmailVerifyResult> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { email, valid: false, reason: "invalid_format" };
    }

    if (this.hunterApiKey) {
      try {
        const { data } = await firstValueFrom(
          this.http.get("https://api.hunter.io/v2/email-verifier", {
            params: { email, api_key: this.hunterApiKey },
          }),
        );
        const d = (
          data as {
            data: {
              result: string;
              score: number;
              regexp: boolean;
              smtp_server: boolean;
            };
          }
        ).data;
        return {
          email,
          valid: d.result === "deliverable",
          score: d.score,
          reason: d.result,
          checks: { format: d.regexp, mxRecord: d.smtp_server },
        };
      } catch (err) {
        this.logger.warn(
          `Hunter email verify failed for ${email}: ${String(err)}`,
        );
      }
    }

    return {
      email,
      valid: true,
      reason: "format_only",
      note: "Configure HUNTER_IO_API_KEY for full deliverability verification",
    };
  }

  // ─── Bulk email verification ──────────────────────────────────────────────

  async bulkVerify(
    userId: string,
    emails: string[],
  ): Promise<EmailVerifyResult[]> {
    if (!emails?.length) return [];
    const batch = emails.slice(0, 50);
    const results = await Promise.allSettled(
      batch.map((email) => this.verifyEmail(userId, email)),
    );
    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { email: batch[i], valid: false, reason: "verification_error" },
    );
  }

  // ─── Intent signals ───────────────────────────────────────────────────────

  async getIntentSignals(
    userId: string,
    industry?: string,
  ): Promise<Record<string, unknown>> {
    const cacheKey = `directory:intent:${industry ?? "all"}`;

    const cached = await this.redis.cacheGet(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const result = await this.ai.generateJson<{
      signals: Array<{
        company: string;
        signal: string;
        industry: string;
        state: string;
        date: string;
        relevance: "high" | "medium" | "low";
      }>;
      summary: string;
    }>(
      "You are a Nigerian B2B sales intelligence analyst. Valid JSON only.",
      `Generate realistic B2B intent signals for Nigerian businesses in ${industry ?? "all industries"}.
Intent signals are: new CAC registrations, companies hiring, recently funded startups, companies expanding.

Return JSON: { signals: [{ company, signal (what happened), industry, state, date (recent), relevance }],
summary (1-sentence overview of the Nigerian B2B landscape right now) }
Limit to 10 signals. Use real Nigerian company name formats.`,
      { task: "nigerian-language", temperature: 0.8, cacheTtl: 3600 },
    );

    await this.redis.cacheSet(cacheKey, JSON.stringify(result.content), 3600);
    return result.content as Record<string, unknown>;
  }

  // ─── Recent searches / activity ───────────────────────────────────────────

  async getRecentSearches(userId: string) {
    return this.prisma.activityLog.findMany({
      where: {
        userId,
        action: { in: ["directory.search", "directory.contact_lookup"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { action: true, metadata: true, createdAt: true },
    });
  }

  // ─── Lead lists ───────────────────────────────────────────────────────────

  async createList(
    userId: string,
    name: string,
    description?: string,
  ): Promise<LeadList> {
    const id = `list_${Date.now()}`;
    const list: LeadList = {
      id,
      userId,
      name,
      description: description ?? "",
      contactIds: [],
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(
      `directory:lists:${userId}:${id}`,
      JSON.stringify(list),
    );
    return list;
  }

  async getUserLists(userId: string): Promise<LeadList[]> {
    const keys = await this.redis.keys(`directory:lists:${userId}:*`);
    if (!keys.length) return [];
    const raw = await Promise.all(keys.map((k) => this.redis.get(k)));
    return raw.filter(Boolean).map((r) => JSON.parse(r as string) as LeadList);
  }

  // ─── Export leads ─────────────────────────────────────────────────────────

  async exportLeads(
    userId: string,
    listId: string | undefined,
    format: "csv" | "json",
  ): Promise<ExportResult> {
    const logs = await this.getRecentSearches(userId);
    const contacts = logs
      .filter((l) => l.action === "directory.contact_lookup")
      .flatMap((l) => {
        const meta = l.metadata as Record<string, unknown> | null;
        return meta
          ? [
              {
                company: String(meta.company ?? ""),
                found: String(meta.found ?? 0),
              },
            ]
          : [];
      });

    if (format === "json") {
      return {
        data: JSON.stringify(contacts, null, 2),
        filename: `leads-${Date.now()}.json`,
        mimeType: "application/json",
      };
    }

    const header = "company,found\n";
    const rows = contacts.map((c) => `${c.company},${c.found}`).join("\n");
    return {
      data: header + rows,
      filename: `leads-${Date.now()}.csv`,
      mimeType: "text/csv",
    };
  }

  // ─── Scrape job history ───────────────────────────────────────────────────

  async getUserJobs(userId: string) {
    return this.prisma.activityLog.findMany({
      where: { userId, action: "directory.scrape_queued" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { metadata: true, createdAt: true },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async logUsage(userId: string): Promise<void> {
    const key = `directory:usage:${userId}:${new Date().toISOString().slice(0, 10)}`;
    await this.redis.incr(key);
    await this.redis.expire(key, 86400);
  }

  private async logActivity(
    userId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.activityLog
      .create({
        data: {
          userId,
          action,
          productSlug: "business-discovery",
          metadata: JSON.stringify(metadata),
        },
      })
      .catch(() => {});
  }

  private mapJobTitleToSeniority(jobTitle: string): string {
    const title = jobTitle.toLowerCase();
    if (
      title.includes("ceo") ||
      title.includes("founder") ||
      title.includes("director") ||
      title.includes("vp")
    )
      return "senior";
    if (
      title.includes("manager") ||
      title.includes("lead") ||
      title.includes("head")
    )
      return "senior";
    if (
      title.includes("junior") ||
      title.includes("intern") ||
      title.includes("assistant")
    )
      return "junior";
    return "manager";
  }
}
