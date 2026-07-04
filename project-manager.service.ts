// src/modules/planai/services/project-manager.service.ts
// ─────────────────────────────────────────────────────────────────────────
// DRAFT — this is the wiring to ADD to your existing project-manager.service.ts
// (the file backing POST /planai/projects/workspaces per
// boldmind-service-canonical.md §4.14 PLANAI 09). Your actual file already
// has PrismaService injected and a createWorkspace()-shaped method — this
// shows the minimal diff, not a full rewrite. Merge it in rather than
// replacing the file.
// ─────────────────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { GasWebhookService } from '../../../common/services/gas-webhook.service';

@Injectable()
export class ProjectManagerService {
  constructor(
    private readonly prisma: PrismaService,
    // ── ADD this ──────────────────────────────────────────────
    private readonly gasWebhook: GasWebhookService,
  ) {}

  /**
   * POST /planai/projects/workspaces
   * { name, description?, color?, icon? } -> Workspace
   */
  async createWorkspace(userId: string, dto: { name: string; description?: string; color?: string; icon?: string }) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        icon: dto.icon,
        ownerId: userId,
      },
    });

    // ── ADD this block ────────────────────────────────────────
    // Fire-and-forget: auto-provision a matching Drive folder under
    // "02 — Client Projects" using the same _TEMPLATE structure the
    // "➕ Create New Client Project" Sheet menu item builds manually.
    // Never awaited into the response — Drive being slow/down must not
    // block workspace creation for the user.
    void this.gasWebhook.trigger({
      action: 'createClientProject',
      projectName: `${dto.name} — ${new Date().getFullYear()}`,
    });
    // ── end ADD ───────────────────────────────────────────────

    return workspace;
  }
}
