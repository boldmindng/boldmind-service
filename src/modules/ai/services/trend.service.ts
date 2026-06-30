
import { Injectable, Logger } from '@nestjs/common';
import { GeminiProvider } from '../providers/gemini.provider';
import { RedisService } from '../../../database/redis.service';

export interface TrendAlert {
    title: string;
    platform: 'google' | 'x' | 'news' | 'rss' | 'techcabal' | 'nairametrics';
    url: string;
    description?: string;
    category?: 'tech' | 'business' | 'startup' | 'ai' | 'crypto' | 'policy';
    publishedAt?: string;
    relevanceScore?: number; 
    source?: string;
}

export interface TrendSummary {
    trends: TrendAlert[];
    aiSummary: string;
    fetchedAt: string;
    topic?: string;
}

// ─── Nigerian tech RSS sources (all free) ────────────────────────────────────

const NIGERIAN_RSS_FEEDS: Array<{ url: string; platform: TrendAlert['platform']; name: string }> = [
    { url: 'https://techcabal.com/feed/', platform: 'techcabal', name: 'TechCabal' },
    { url: 'https://nairametrics.com/feed/', platform: 'nairametrics', name: 'Nairametrics' },
    { url: 'https://techeconomy.ng/feed/', platform: 'news', name: 'TechEconomy' },
    { url: 'https://technext24.com/feed/', platform: 'news', name: 'TechNext' },
    { url: 'https://www.informationng.com/feed', platform: 'news', name: 'InformationNG' },
    { url: 'https://disruptafrica.com/feed/', platform: 'news', name: 'Disrupt Africa' },
];

// Google Trends RSS — free, official
const GOOGLE_TRENDS_RSS = 'https://trends.google.com/trends/trendingsearches/daily/rss?geo=NG';

@Injectable()
export class TrendService {
    private readonly logger = new Logger(TrendService.name);
    private readonly CACHE_TTL = 1800; // 30 min cache

    constructor(
        private readonly gemini: GeminiProvider,
        private readonly redis: RedisService,
    ) { }

    // ── Main: Get all trending topics relevant to BoldMind ───────────────────

    async getTrendingForBoldMind(): Promise<TrendSummary> {
        const cacheKey = 'trends:boldmind:all';
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const [rssItems, googleTrends] = await Promise.allSettled([
            this.fetchFromRssFeeds(),
            this.fetchGoogleTrendsNG(),
        ]);

        const allTrends: TrendAlert[] = [
            ...(rssItems.status === 'fulfilled' ? rssItems.value : []),
            ...(googleTrends.status === 'fulfilled' ? googleTrends.value : []),
        ];

        // Use Gemini to score relevance and summarize
        const summary = await this.summarizeTrends(allTrends);

        const result: TrendSummary = {
            trends: summary.rankedTrends,
            aiSummary: summary.summary,
            fetchedAt: new Date().toISOString(),
        };

        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
        return result;
    }

    /**
     * Get trending tech topics for AmeboGist content suggestion
     */
    async getTrendingTechUpdates(): Promise<TrendAlert[]> {
        const cacheKey = 'trends:tech:ng';
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        // Use Gemini Google Search grounding — real-time, free
        if (this.gemini.available) {
            try {
                const result = await this.gemini.searchAndSummarize(
                    `What are the top 10 trending technology and startup news topics in Nigeria and Africa today? 
          Focus on: AI/ML developments, Nigerian fintech, startup funding, creator economy, digital policy.
          Format as JSON array: [{ "title": string, "description": string, "category": string, "url": string }]
          Return ONLY the JSON array, no markdown.`,
                    'You are a Nigerian tech news curator. Find the most relevant trending topics for Nigerian tech entrepreneurs and creators.',
                );

                try {
                    const parsed = JSON.parse(result.content.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()) as TrendAlert[];
                    const trends = parsed.map((t) => ({ ...t, platform: 'google' as const, relevanceScore: 85 }));
                    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(trends));
                    return trends;
                } catch {
                    // Fall through to RSS
                }
            } catch (err) {
                this.logger.warn(`Gemini trend search failed: ${String(err)}`);
            }
        }

        // Fallback: RSS feeds
        const rssItems = await this.fetchFromRssFeeds(['tech', 'startup', 'ai']);
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(rssItems));
        return rssItems;
    }

    /**
     * Get AI/ML specific trends — for content about AI tools training
     */
    async getAiTrends(): Promise<TrendAlert[]> {
        const cacheKey = 'trends:ai:global';
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        if (this.gemini.available) {
            const result = await this.gemini.searchAndSummarize(
                `What are the latest AI and machine learning developments, model releases, and tools launched in the past week?
        Focus on tools and platforms that Nigerian developers and entrepreneurs can use.
        Include: new model releases, open-source tools, free/affordable AI services, workflow automation.
        Return as JSON array: [{ "title": string, "description": string, "url": string, "category": "ai" }]
        ONLY return valid JSON array.`,
            );

            try {
                const parsed = JSON.parse(result.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as TrendAlert[];
                await this.redis.setex(cacheKey, this.CACHE_TTL * 2, JSON.stringify(parsed));
                return parsed;
            } catch {
                // Return static fallback
            }
        }

        return this.getStaticAiTrends();
    }

    /**
     * Get trending topics for a specific niche (for AmeboGist article suggestions)
     */
    async getTrendsByNiche(niche: string): Promise<TrendSummary> {
        const cacheKey = `trends:niche:${niche.toLowerCase().replace(/\s/g, '-')}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        let trends: TrendAlert[] = [];
        let aiSummary = '';

        if (this.gemini.available) {
            const result = await this.gemini.searchAndSummarize(
                `Find the top 8 trending news and developments about "${niche}" relevant to the Nigerian market.
        Return as JSON: { "trends": [{ "title", "description", "url", "category", "relevanceScore" }], "summary": "2-3 sentence overview" }
        ONLY return valid JSON.`,
                `You are a Nigerian market research analyst specializing in ${niche}.`,
            );

            try {
                const parsed = JSON.parse(result.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as {
                    trends: TrendAlert[];
                    summary: string;
                };
                trends = parsed.trends ?? [];
                aiSummary = parsed.summary ?? '';
            } catch {
                trends = await this.fetchFromRssFeeds();
            }
        } else {
            trends = await this.fetchFromRssFeeds();
        }

        const summary: TrendSummary = { trends, aiSummary, fetchedAt: new Date().toISOString(), topic: niche };
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(summary));
        return summary;
    }

    /**
     * Content ideas generator — suggests articles for AmeboGist writers
     */
    async generateContentIdeas(count = 10): Promise<Array<{
        title: string;
        angle: string;
        language: 'pidgin' | 'english';
        category: string;
        estimatedEngagement: 'high' | 'medium' | 'low';
    }>> {
        const cacheKey = `trends:content-ideas:${new Date().toISOString().slice(0, 10)}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const trending = await this.getTrendingTechUpdates().catch(() => this.getStaticAiTrends());

        const trendContext = trending
            .slice(0, 5)
            .map((t) => `- ${t.title}: ${t.description ?? ''}`)
            .join('\n');

        if (!this.gemini.available) {
            return this.getStaticContentIdeas();
        }

        const result = await this.gemini.chat(
            `You are an editor at AmeboGist, a Nigerian tech and entrepreneurship platform.
       Generate viral content ideas that Nigerian entrepreneurs and creators will engage with.`,
            `Based on these trending topics:
${trendContext}

Generate ${count} content ideas for our Nigerian audience. Mix of Pidgin and English content.
Return as JSON array: [{ 
  "title": "catchy article title",
  "angle": "unique Nigerian perspective/angle",
  "language": "pidgin" or "english",
  "category": "tech|business|creator|lifestyle|education",
  "estimatedEngagement": "high|medium|low"
}]
ONLY return the JSON array.`,
            { jsonMode: true, temperature: 0.85 },
        );

        try {
            const ideas = JSON.parse(result.content) as ReturnType<typeof this.generateContentIdeas> extends Promise<infer T> ? T : never;
            await this.redis.setex(cacheKey, 3600 * 6, JSON.stringify(ideas)); // 6hr cache
            return ideas;
        } catch {
            return this.getStaticContentIdeas();
        }
    }

    // ── Private: RSS Fetcher ──────────────────────────────────────────────────

    private async fetchFromRssFeeds(
        categories?: string[],
        maxItems = 20,
    ): Promise<TrendAlert[]> {
        const results: TrendAlert[] = [];

        await Promise.allSettled(
            NIGERIAN_RSS_FEEDS.map(async ({ url, platform, name }) => {
                try {
                    const res = await fetch(url, {
                        headers: { 'User-Agent': 'BoldMind/1.0 RSS Reader' },
                        signal: AbortSignal.timeout(5000),
                    });
                    if (!res.ok) return;

                    const xml = await res.text();
                    const items = this.parseRssXml(xml, platform, name);
                    results.push(...items);
                } catch (err) {
                    this.logger.debug(`RSS fetch failed for ${name}: ${String(err)}`);
                }
            }),
        );

        // Sort by recency, deduplicate
        const seen = new Set<string>();
        const unique = results
            .filter((r) => {
                const key = r.title.toLowerCase().slice(0, 50);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => {
                if (!a.publishedAt || !b.publishedAt) return 0;
                return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
            })
            .slice(0, maxItems);

        return unique;
    }

    private parseRssXml(xml: string, platform: TrendAlert['platform'], source: string): TrendAlert[] {
        const items: TrendAlert[] = [];

        // Simple regex-based RSS parser (no external deps)
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            const item = match[1];
            const title = this.extractTag(item, 'title');
            const link = this.extractTag(item, 'link');
            const description = this.extractTag(item, 'description');
            const pubDate = this.extractTag(item, 'pubDate');

            if (title && link) {
                // Determine category from keywords
                const content = (title + ' ' + (description ?? '')).toLowerCase();
                const category = this.categorize(content);

                items.push({
                    title: this.stripHtml(title),
                    platform,
                    url: link.trim(),
                    description: this.stripHtml(description ?? '').slice(0, 200),
                    category,
                    publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
                    source,
                    relevanceScore: this.scoreRelevance(content),
                });
            }
        }

        return items;
    }

    private async fetchGoogleTrendsNG(): Promise<TrendAlert[]> {
        try {
            const res = await fetch(GOOGLE_TRENDS_RSS, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return [];

            const xml = await res.text();
            const items = this.parseRssXml(xml, 'google', 'Google Trends NG');
            return items.map((item) => ({ ...item, category: 'tech' as const }));
        } catch {
            return [];
        }
    }

    private async summarizeTrends(trends: TrendAlert[]): Promise<{
        rankedTrends: TrendAlert[];
        summary: string;
    }> {
        if (!this.gemini.available || trends.length === 0) {
            return { rankedTrends: trends.slice(0, 15), summary: 'Latest trends from Nigerian tech ecosystem.' };
        }

        const trendList = trends
            .slice(0, 20)
            .map((t, i) => `${i + 1}. ${t.title} (${t.source ?? t.platform})`)
            .join('\n');

        const result = await this.gemini.chat(
            'You are a Nigerian tech trend analyst. Be concise and focus on business relevance.',
            `Analyze these trends and return JSON: {
  "summary": "2-3 sentence overview of what's trending in Nigerian tech today",
  "topIndices": [array of 8 most relevant indices for Nigerian entrepreneurs, 0-indexed]
}

Trends:
${trendList}

Return ONLY the JSON object.`,
            { jsonMode: true, temperature: 0.3 },
        );

        try {
            const parsed = JSON.parse(result.content) as { summary: string; topIndices: number[] };
            const rankedTrends = [
                ...parsed.topIndices.map((i) => trends[i]).filter(Boolean),
                ...trends.filter((_, i) => !parsed.topIndices.includes(i)),
            ].slice(0, 15);
            return { rankedTrends, summary: parsed.summary };
        } catch {
            return { rankedTrends: trends.slice(0, 15), summary: 'Latest trends from Nigerian tech ecosystem.' };
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private extractTag(xml: string, tag: string): string {
        const match = new RegExp(`<${tag}(?:[^>]*)?><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}(?:[^>]*)?>([^<]*)<\\/${tag}>`, 'i').exec(xml);
        return (match?.[1] ?? match?.[2] ?? '').trim();
    }

    private stripHtml(html: string): string {
        return html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
    }

    private categorize(content: string): TrendAlert['category'] {
        if (/\bai\b|machine learning|gpt|gemini|llm|neural|openai/.test(content)) return 'ai';
        if (/startup|funding|vc|venture|series [ab]|raise/.test(content)) return 'startup';
        if (/bitcoin|crypto|blockchain|web3|defi/.test(content)) return 'crypto';
        if (/policy|regulation|cbn|sec|nitda|nafdac|law/.test(content)) return 'policy';
        if (/business|revenue|profit|market|sales/.test(content)) return 'business';
        return 'tech';
    }

    private scoreRelevance(content: string): number {
        const nigeriaKeywords = ['nigeria', 'naija', 'lagos', 'abuja', 'african', 'africa'];
        const boldmindKeywords = ['ai', 'startup', 'creator', 'entrepreneur', 'tech', 'business', 'fintech'];
        let score = 50;
        for (const kw of nigeriaKeywords) if (content.includes(kw)) score += 10;
        for (const kw of boldmindKeywords) if (content.includes(kw)) score += 5;
        return Math.min(100, score);
    }

    private getStaticAiTrends(): TrendAlert[] {
        return [
            {
                title: 'Llama 3.3 70B — Free via Groq, 300 tok/sec inference',
                platform: 'news',
                url: 'https://console.groq.com',
                description: 'Meta\'s latest Llama model available for free via Groq Cloud. Perfect for Nigerian startups.',
                category: 'ai',
                relevanceScore: 95,
            },
            {
                title: 'Gemini 2.0 Flash — Free Google Search grounding for all developers',
                platform: 'google',
                url: 'https://ai.google.dev',
                description: 'Real-time web search built into Gemini at no cost. Game-changer for Nigerian app developers.',
                category: 'ai',
                relevanceScore: 90,
            },
            {
                title: 'Nigeria Startup Act 2022 — CAC registration streamlined for tech founders',
                platform: 'news',
                url: 'https://startup.gov.ng',
                description: 'New fast-track CAC registration pathway for Nigerian tech startups now active.',
                category: 'policy',
                relevanceScore: 88,
            },
            {
                title: 'Creator Economy Nigeria 2026 — Content monetization options expanding',
                platform: 'x',
                url: 'https://techcabal.com',
                description: 'YouTube, TikTok, and Instagram all expanding monetization for Nigerian creators.',
                category: 'business',
                relevanceScore: 82,
            },
        ];
    }

    private getStaticContentIdeas() {
        return [
            { title: 'How to Start a Digital Business in Nigeria With ₦0', angle: 'Zero-cost tools for Nigerian founders', language: 'english' as const, category: 'business', estimatedEngagement: 'high' as const },
            { title: 'ChatGPT vs Gemini: Which One Better for Naija Business?', angle: 'Pidgin comparison for Nigerian SME owners', language: 'pidgin' as const, category: 'tech', estimatedEngagement: 'high' as const },
            { title: '10 WhatsApp Business Tricks Every Nigerian SME Owner Needs', angle: 'Actionable automation for informal sector', language: 'pidgin' as const, category: 'business', estimatedEngagement: 'high' as const },
            { title: 'How Nigerian Creators Are Making ₦500k/Month on Instagram', angle: 'Real case studies, strategies', language: 'english' as const, category: 'creator', estimatedEngagement: 'high' as const },
            { title: 'Best Free AI Tools Wey Go Help Your Business in 2026', angle: 'Free alternatives specifically tested in Nigeria', language: 'pidgin' as const, category: 'tech', estimatedEngagement: 'medium' as const },
        ];
    }
}