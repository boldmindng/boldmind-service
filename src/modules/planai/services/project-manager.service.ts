import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AiService } from '../../ai/ai.service';
import {
  CreateWorkspaceDto, CreateProjectDto, CreateTaskDto,
  UpdateTaskDto, StartPomodoroDto, UpdateWorkspaceDto,
  InviteMemberDto
} from '../dto/project-manager.dto';
import { TaskStatus, TaskPriority, WorkspaceRole } from '@prisma/client';

@Injectable()
export class ProjectManagerService {
  private readonly logger = new Logger(ProjectManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // ─── Workspaces ──────────────────────────────────────────────────────────────
 async createWorkspace(userId: string, dto: CreateWorkspaceDto) {
    const workspace = await this.prisma.workspace.create({
      data: { name: dto.name, description: dto.description, color: dto.color, icon: dto.icon, ownerId: userId },
    });
    await this.prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId, role: 'OWNER' },
    });
    return workspace;
  }

  async getMyWorkspaces(userId: string) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      include: {
        _count: { select: { projects: true, tasks: true } },
        members: { select: { role: true, userId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWorkspace(id: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        _count: { select: { projects: true, tasks: true } },
        members: { select: { role: true, userId: true } },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    await this.assertMember(userId, id);
    return workspace;
  }

  async updateWorkspace(id: string, userId: string, dto: UpdateWorkspaceDto) {
    await this.assertMember(userId, id);
    return this.prisma.workspace.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
      },
    });
  }

  async deleteWorkspace(id: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.ownerId !== userId) throw new ForbiddenException('Only the owner can delete the workspace');
    await this.prisma.workspace.delete({ where: { id } });
    return { message: 'Workspace deleted' };
  }

  // ─── MEMBERS ─────────────────────────────────────────────────────────────────

  async inviteMember(workspaceId: string, userId: string, dto: InviteMemberDto) {
    await this.assertMember(userId, workspaceId);
    const targetUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!targetUser) throw new NotFoundException('User not found');

    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUser.id } },
    });
    if (existing) throw new ForbiddenException('User is already a member');

    return this.prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: targetUser.id,
        role: (dto.role as WorkspaceRole) ?? WorkspaceRole.MEMBER,
      },
    });
  }

  async removeMember(workspaceId: string, userId: string, targetUserId: string) {
    const [workspace, membership] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: workspaceId } }),
      this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      }),
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (!membership) throw new NotFoundException('Member not found');

    // Only owner or the member themselves can remove (owner can always remove)
    if (workspace.ownerId !== userId && targetUserId !== userId)
      throw new ForbiddenException('Only the workspace owner can remove other members');

    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    return { message: 'Member removed' };
  }

  async updateMemberRole(workspaceId: string, userId: string, targetUserId: string, role: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.ownerId !== userId) throw new ForbiddenException('Only the workspace owner can change roles');

    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!member) throw new NotFoundException('Member not found');

    return this.prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role: role as WorkspaceRole },
    });
  }

  // ─── PROJECTS ────────────────────────────────────────────────────────────────

  /**
   * Controller provides workspaceId from path, userId, and body: { name, description?, color? }
   * We ignore CreateProjectDto fields if workspaceId is provided separately.
   */
  async createProject(
    workspaceId: string,
    userId: string,
    data: { name: string; description?: string; color?: string },
  ) {
    await this.assertMember(userId, workspaceId);
    return this.prisma.project.create({
      data: {
        workspaceId,
        name: data.name,
        description: data.description,
        color: data.color,
        createdById: userId,
      },
    });
  }

  async getProjects(workspaceId: string, userId: string) {
    await this.assertMember(userId, workspaceId);
    return this.prisma.project.findMany({
      where: { workspaceId },
      include: { _count: { select: { tasks: true } } },
    });
  }

  // ─── TASKS ───────────────────────────────────────────────────────────────────

  async createTask(workspaceId: string, userId: string, dto: CreateTaskDto) {
    await this.assertMember(userId, workspaceId);
    return this.prisma.task.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        status: (dto.status as TaskStatus) ?? TaskStatus.TODO,
        priority: (dto.priority as TaskPriority) ?? TaskPriority.MEDIUM,
        createdById: userId,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        tags: dto.tags ?? [],
        estimatedMinutes: dto.estimatedMinutes,
        parentTaskId: dto.parentTaskId,
      },
    });
  }

  async getTasks(
    workspaceId: string,
    userId: string,
    filters?: { projectId?: string; status?: string; assigneeId?: string; page?: number; limit?: number },
  ) {
    await this.assertMember(userId, workspaceId);
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      parentTaskId: null,
      ...(filters?.projectId ? { projectId: filters.projectId } : {}),
      ...(filters?.status ? { status: filters.status as TaskStatus } : {}),
      ...(filters?.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          subtasks: { select: { id: true, title: true, status: true } },
          assignee: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async updateTask(taskId: string, userId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.workspaceId);

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status ? { status: dto.status as TaskStatus } : {}),
        ...(dto.priority ? { priority: dto.priority as TaskPriority } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
        ...(dto.status === 'DONE' ? { completedAt: new Date() } : {}),
      },
    });
  }

  async deleteTask(taskId: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.workspaceId);
    await this.prisma.task.delete({ where: { id: taskId } });
    return { message: 'Task deleted' };
  }

  // ─── DASHBOARD ───────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    const [workspaceCount, tasksAssigned, tasksDone, pomodoroTotal, focusMinutes] = await Promise.all([
      this.prisma.workspaceMember.count({ where: { userId } }),
      this.prisma.task.count({ where: { assigneeId: userId, status: { not: 'DONE' } } }),
      this.prisma.task.count({ where: { assigneeId: userId, status: 'DONE' } }),
      this.prisma.pomodoroSession.count({ where: { userId, isCompleted: true } }),
      this.prisma.oSProfile.findUnique({
        where: { userId },
        select: { totalFocusMinutes: true },
      }),
    ]);

    const recentTasks = await this.prisma.task.findMany({
      where: { assigneeId: userId },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, title: true, status: true, priority: true, dueDate: true },
    });

    return {
      workspaces: workspaceCount,
      tasksAssigned,
      tasksDone,
      pomodoros: pomodoroTotal,
      totalFocusHours: Math.round(((focusMinutes?.totalFocusMinutes ?? 0) / 60) * 10) / 10,
      recentTasks,
    };
  }

  // ─── AI task breakdown ────────────────────────────────────────────────────────

  async breakDownTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertMember(userId, task.workspaceId);

    const result = await this.ai.generateJson<{
      subtasks: Array<{ title: string; description: string; estimatedMinutes: number; priority: string }>;
      totalEstimatedMinutes: number;
    }>(
      'You are an expert project manager for Nigerian entrepreneurs. Valid JSON only.',
      `Break this task into actionable subtasks for a Nigerian business owner.
Task: "${task.title}"
Description: ${task.description ?? 'none'}

Return JSON: { subtasks: [{ title, description, estimatedMinutes, priority (LOW|MEDIUM|HIGH) }],
totalEstimatedMinutes }
Max 7 subtasks. Be practical and specific to the Nigerian business context.`,
      { task: 'fast-chat', temperature: 0.6 },
    );

    // Create subtasks in DB
    const created = await Promise.all(
      result.content.subtasks.map((s) =>
        this.prisma.task.create({
          data: {
            workspaceId: task.workspaceId,
            projectId: task.projectId,
            title: s.title,
            description: s.description,
            status: TaskStatus.TODO,
            priority: (s.priority as TaskPriority) ?? TaskPriority.MEDIUM,
            createdById: userId,
            parentTaskId: taskId,
            estimatedMinutes: s.estimatedMinutes,
          },
        }),
      ),
    );

    return { parent: task, subtasks: created, totalEstimatedMinutes: result.content.totalEstimatedMinutes };
  }

  // ─── Weekly brain dump ────────────────────────────────────────────────────────

  async processBrainDump(userId: string, workspaceId: string, rawText: string) {
    await this.assertMember(userId, workspaceId);

    const result = await this.ai.generateJson<{
      tasks: Array<{ title: string; priority: string; category: string; estimatedMinutes: number }>;
      summary: string;
    }>(
      'You are a Nigerian business productivity coach. Valid JSON only.',
      `Organise this brain dump into prioritised tasks for a Nigerian entrepreneur.
Brain dump: "${rawText}"

Return JSON: { tasks: [{ title (clear action), priority (LOW|MEDIUM|HIGH|URGENT), 
category (marketing|operations|finance|admin|personal), estimatedMinutes }], 
summary (1 sentence on the biggest priorities) }
Max 10 tasks. Use action verbs for titles.`,
      { task: 'fast-chat', temperature: 0.6 },
    );

    const created = await Promise.all(
      result.content.tasks.map((t) =>
        this.prisma.task.create({
          data: {
            workspaceId,
            title: t.title,
            status: TaskStatus.TODO,
            priority: (t.priority as TaskPriority) ?? TaskPriority.MEDIUM,
            createdById: userId,
            estimatedMinutes: t.estimatedMinutes,
            tags: [t.category],
          },
        }),
      ),
    );

    return { tasksCreated: created.length, tasks: created, summary: result.content.summary };
  }

  // ─── Pomodoro ────────────────────────────────────────────────────────────────

  async startPomodoro(userId: string, dto: StartPomodoroDto) {
    const session = await this.prisma.pomodoroSession.create({
      data: {
        userId,
        taskId: dto.taskId,
        durationMinutes: dto.durationMinutes,
        type: dto.type ?? 'work',
        startedAt: new Date(),
        isCompleted: false,
      },
    });
    return { sessionId: session.id, durationMinutes: dto.durationMinutes, startedAt: session.startedAt };
  }

  async completePomodoro(userId: string, sessionId: string, interruptions = 0) {
    const session = await this.prisma.pomodoroSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException('Pomodoro session not found');

    const [updated] = await Promise.all([
      this.prisma.pomodoroSession.update({
        where: { id: sessionId },
        data: { isCompleted: true, endedAt: new Date(), interruptions },
      }),
      this.prisma.oSProfile.upsert({
        where: { userId },
        create: { userId, totalPomodoros: 1, totalFocusMinutes: session.durationMinutes },
        update: { totalPomodoros: { increment: 1 }, totalFocusMinutes: { increment: session.durationMinutes } },
      }),
    ]);

    return { message: `Pomodoro complete! 🍅 ${session.durationMinutes} minutes focused.`, session: updated };
  }

  async getPomodoroStats(userId: string) {
    const [total, profile] = await Promise.all([
      this.prisma.pomodoroSession.count({ where: { userId, isCompleted: true } }),
      this.prisma.oSProfile.findUnique({
        where: { userId },
        select: { totalPomodoros: true, totalFocusMinutes: true, streakDays: true },
      }),
    ]);
    return {
      completedPomodoros: total,
      totalFocusMinutes: profile?.totalFocusMinutes ?? 0,
      totalFocusHours: Math.round(((profile?.totalFocusMinutes ?? 0) / 60) * 10) / 10,
      streakDays: profile?.streakDays ?? 0,
    };
  }

  // ─── Knowledge graph ─────────────────────────────────────────────────────────

  async createKnowledgeNode(userId: string, input: {
    title: string; content: string; nodeType?: string;
    color?: string; tags?: string[]; xPosition?: number; yPosition?: number; sourceUrl?: string;
  }) {
    return this.prisma.knowledgeNode.create({
      data: {
        userId,
        title: input.title,
        content: input.content,
        nodeType: input.nodeType ?? 'note',
        color: input.color ?? '#3B82F6',
        tags: input.tags ?? [],
        xPosition: input.xPosition ?? 0,
        yPosition: input.yPosition ?? 0,
        sourceUrl: input.sourceUrl,
      },
    });
  }

  async getKnowledgeGraph(userId: string) {
    return this.prisma.knowledgeNode.findMany({
      where: { userId, isArchived: false },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ─── AI meeting notes ────────────────────────────────────────────────────────

  async processMeetingNotes(userId: string, workspaceId: string, audioBuffer?: Buffer, rawTranscript?: string) {
    let transcript = rawTranscript ?? '';

    if (audioBuffer && !rawTranscript) {
      transcript = await this.ai.transcribeAudio(audioBuffer);
    }

    if (!transcript) throw new NotFoundException('No audio or transcript provided');

    const result = await this.ai.generateJson<{
      summary: string;
      actionItems: Array<{ task: string; owner: string; deadline?: string; priority: string }>;
      decisions: string[];
      nextMeeting?: string;
    }>(
      'You are a Nigerian business meeting notes processor. Valid JSON only.',
      `Extract structured meeting notes from this transcript.
Transcript: "${transcript.slice(0, 3000)}"

Return JSON: { summary (3-sentence meeting summary), 
actionItems: [{ task, owner (person responsible), deadline (if mentioned), priority (LOW|MEDIUM|HIGH) }],
decisions: [key decisions made],
nextMeeting (if discussed, else null) }`,
      { task: 'reasoning', temperature: 0.4 },
    );

    // Auto-create action items as tasks
    const created: string[] = [];
    for (const item of result.content.actionItems) {
      try {
        const task = await this.prisma.task.create({
          data: {
            workspaceId,
            title: item.task,
            status: TaskStatus.TODO,
            priority: (item.priority as TaskPriority) ?? TaskPriority.MEDIUM,
            createdById: userId,
            dueDate: item.deadline ? new Date(item.deadline) : undefined,
            tags: ['meeting-action'],
          },
        });
        created.push(task.id);
      } catch {
        // non-critical — don't fail if task creation fails
      }
    }

    return { ...result.content, tasksCreated: created.length, transcript: transcript.slice(0, 500) + '...' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async assertMember(userId: string, workspaceId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this workspace');
  }
}