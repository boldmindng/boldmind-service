import {
    Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards,
    HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectManagerService } from '../services/project-manager.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto, InviteMemberDto, CreateTaskDto, UpdateTaskDto } from '../dto/all-planai.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';

@ApiTags('Project Manager')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('project-manager')
export class ProjectManagerController {
    constructor(private readonly projectManagerService: ProjectManagerService) { }

    // ─── WORKSPACES ───────────────────────────────────────────

    @Post('workspaces')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new workspace' })
    createWorkspace(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateWorkspaceDto,
    ) {
        return this.projectManagerService.createWorkspace(userId, dto);
    }

    @Get('workspaces')
    @ApiOperation({ summary: 'Get my workspaces' })
    getMyWorkspaces(@CurrentUser('id') userId: string) {
        return this.projectManagerService.getMyWorkspaces(userId);
    }

    @Get('workspaces/:id')
    @ApiOperation({ summary: 'Get workspace details' })
    getWorkspace(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.projectManagerService.getWorkspace(id, userId);
    }

    @Patch('workspaces/:id')
    @ApiOperation({ summary: 'Update workspace' })
    updateWorkspace(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateWorkspaceDto,
    ) {
        return this.projectManagerService.updateWorkspace(id, userId, dto);
    }

    @Delete('workspaces/:id')
    @ApiOperation({ summary: 'Delete workspace (owner only)' })
    deleteWorkspace(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.projectManagerService.deleteWorkspace(id, userId);
    }

    // ─── MEMBERS ──────────────────────────────────────────────

    @Post('workspaces/:id/members')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Invite a member to workspace' })
    inviteMember(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() dto: InviteMemberDto,
    ) {
        return this.projectManagerService.inviteMember(id, userId, dto);
    }

    @Delete('workspaces/:id/members/:targetUserId')
    @ApiOperation({ summary: 'Remove a member from workspace' })
    removeMember(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Param('targetUserId') targetUserId: string,
    ) {
        return this.projectManagerService.removeMember(id, userId, targetUserId);
    }

    @Patch('workspaces/:id/members/:targetUserId/role')
    @ApiOperation({ summary: 'Update member role' })
    updateMemberRole(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Param('targetUserId') targetUserId: string,
        @Body('role') role: any,
    ) {
        return this.projectManagerService.updateMemberRole(id, userId, targetUserId, role);
    }

    // ─── PROJECTS ─────────────────────────────────────────────

    @Post('workspaces/:id/projects')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a project in workspace' })
    createProject(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() data: { name: string; description?: string; color?: string },
    ) {
        return this.projectManagerService.createProject(id, userId, data);
    }

    @Get('workspaces/:id/projects')
    @ApiOperation({ summary: 'Get workspace projects' })
    getProjects(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.projectManagerService.getProjects(id, userId);
    }

    // ─── TASKS ────────────────────────────────────────────────

    @Post('workspaces/:id/tasks')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a task in workspace' })
    createTask(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Body() dto: CreateTaskDto,
    ) {
        return this.projectManagerService.createTask(id, userId, dto);
    }

    @Get('workspaces/:id/tasks')
    @ApiOperation({ summary: 'Get workspace tasks with filters' })
    getTasks(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @Query() filters: { projectId?: string; status?: string; assigneeId?: string; page?: number; limit?: number },
    ) {
        return this.projectManagerService.getTasks(id, userId, filters);
    }

    @Patch('tasks/:taskId')
    @ApiOperation({ summary: 'Update a task' })
    updateTask(
        @Param('taskId') taskId: string,
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateTaskDto,
    ) {
        return this.projectManagerService.updateTask(taskId, userId, dto);
    }

    @Delete('tasks/:taskId')
    @ApiOperation({ summary: 'Delete a task' })
    deleteTask(
        @Param('taskId') taskId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.projectManagerService.deleteTask(taskId, userId);
    }

    // ─── DASHBOARD ────────────────────────────────────────────

    @Get('dashboard')
    @ApiOperation({ summary: 'Get OS dashboard for current user' })
    getDashboard(@CurrentUser('id') userId: string) {
        return this.projectManagerService.getDashboard(userId);
    }
}