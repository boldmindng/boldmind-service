import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PlanAIJobType } from '@prisma/client';
import { CreateTemplateDto, UpdateTemplateDto } from '../dto/all-planai.dto';

@Injectable()
export class PlanAITemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTemplateDto) {
    return this.prisma.planAITemplate.create({
      data: {
        userId,
        type: dto.type,
        name: dto.name,
        description: dto.description,
        prompt: dto.prompt,
        exampleOutput: dto.exampleOutput as unknown as {},
        isPublic: dto.isPublic ?? false,
        tags: dto.tags ?? [],
      },
    });
  }

  async findAll(userId: string, type?: PlanAIJobType) {
    return this.prisma.planAITemplate.findMany({
      where: {
        OR: [{ userId }, { isPublic: true }],
        ...(type ? { type } : {}),
      },
      orderBy: [{ useCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const template = await this.prisma.planAITemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    if (!template.isPublic && template.userId !== userId) {
      throw new ForbiddenException('Access denied to this template');
    }
    return template;
  }

  async update(userId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.planAITemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    if (template.userId !== userId) throw new ForbiddenException('You do not own this template');

    return this.prisma.planAITemplate.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.prompt ? { prompt: dto.prompt } : {}),
        ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
      },
    });
  }

  async remove(userId: string, id: string): Promise<{ message: string }> {
    const template = await this.prisma.planAITemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    if (template.userId !== userId) throw new ForbiddenException('You do not own this template');
    await this.prisma.planAITemplate.delete({ where: { id } });
    return { message: `Template ${id} deleted` };
  }

  async incrementUseCount(id: string): Promise<void> {
    await this.prisma.planAITemplate.update({
      where: { id },
      data: { useCount: { increment: 1 } },
    });
  }

  async getPublicTemplates(type?: PlanAIJobType) {
    return this.prisma.planAITemplate.findMany({
      where: { isPublic: true, ...(type ? { type } : {}) },
      orderBy: { useCount: 'desc' },
      take: 50,
      select: { id: true, type: true, name: true, description: true, tags: true, useCount: true },
    });
  }
}