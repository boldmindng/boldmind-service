import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { Blueprint } from './blueprint.schema';

@Injectable()
export class AfroHustleService {
  private readonly logger = new Logger(AfroHustleService.name);

  constructor(private readonly ai: AiService) {}

  async listBlueprints(query: {
    category?: string;
    difficulty?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, difficulty, page = 1, limit = 20 } = query;
    const filter: any = { isVerified: true };
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;

    const [items, total] = await Promise.all([
      Blueprint.find(filter)
        .sort({ 'stats.views': -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Blueprint.countDocuments(filter),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  async getBlueprintBySlug(slug: string) {
    const blueprint = await Blueprint.findOneAndUpdate(
      { slug },
      { $inc: { 'stats.views': 1 } },
      { new: true },
    ).lean();
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    return blueprint;
  }

  async getBlueprintById(id: string) {
    const blueprint = await Blueprint.findByIdAndUpdate(
      id,
      { $inc: { 'stats.views': 1 } },
      { new: true },
    ).lean();
    if (!blueprint) throw new NotFoundException('Blueprint not found');
    return blueprint;
  }

  async generateBlueprint(userId: string, dto: {
    businessIdea: string;
    category: string;
    startupBudget: number;
    location: string;
  }) {
    const systemPrompt = `You are AfroHustle, a Nigerian business mentorship AI.
Generate a practical, actionable business blueprint tailored for the Nigerian market.
Include specific Nigerian regulations, platforms, and success strategies.
Return ONLY valid JSON matching this structure:
{
  "title": "string",
  "overview": "string (3-4 sentences)",
  "stepByStep": [{"title": "string", "description": "string", "estimatedTime": "string", "checklist": ["string"]}],
  "tools": [{"name": "string", "purpose": "string", "cost": "free|paid|₦X/month"}],
  "startupCost": {"min": number, "max": number},
  "timeToProfit": "string",
  "nigerianContext": {
    "regulations": "string",
    "challenges": ["string"],
    "locationAdvantages": ["string"]
  },
  "skillsRequired": ["string"]
}`;

    const userMessage = `Business idea: ${dto.businessIdea}
Category: ${dto.category}
Available startup budget: ₦${dto.startupBudget.toLocaleString()}
Location: ${dto.location}, Nigeria`;

    const result = await this.ai.generateJson(systemPrompt, userMessage, {
      task: 'reasoning',
    });

    this.logger.log(`Blueprint generated for user ${userId}: ${dto.businessIdea}`);
    return result.content;
  }

  async getCategories() {
    return ['digital', 'service', 'product', 'agriculture', 'ecommerce', 'content'];
  }

  async getFeatured() {
    return Blueprint.find({ isVerified: true })
      .sort({ 'stats.views': -1 })
      .limit(6)
      .lean();
  }
}
