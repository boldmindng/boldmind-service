// src/planai/dto/project-manager.dto.ts

import {
  IsString, IsOptional, IsArray, IsNotEmpty,  IsIn, IsNumber, IsEmail, Min, Max
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkspaceRole } from '@prisma/client';

// ─── Workspace ──────────────────────────────────────────────────────────────

export class CreateWorkspaceDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  color?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  icon?: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  color?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  icon?: string;
}

// ─── Members ────────────────────────────────────────────────────────────────

export class InviteMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    enum: WorkspaceRole,
    default: 'MEMBER',
    description: 'Workspace role for the invited user',
  })
  @IsOptional()
  @IsIn([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
  role?: WorkspaceRole = WorkspaceRole.MEMBER;
}

export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: WorkspaceRole,
    description: 'New role for the member',
  })
  @IsIn([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
  role: WorkspaceRole;
}

// ─── Projects ───────────────────────────────────────────────────────────────

export class CreateProjectDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  workspaceId: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  color?: string;
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export class CreateTaskDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  workspaceId: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  projectId?: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  title: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'] })
  @IsOptional() @IsIn(['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'])
  status?: string = 'TODO';

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string = 'MEDIUM';

  @ApiPropertyOptional() @IsOptional() @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'ISO date string' })
  @IsOptional() @IsString()
  dueDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: 'Parent task ID for subtasks' })
  @IsOptional() @IsString()
  parentTaskId?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'] })
  @IsOptional() @IsIn(['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  assigneeId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  dueDate?: string;
}

// ─── Pomodoro ───────────────────────────────────────────────────────────────

export class StartPomodoroDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  taskId?: string;

  @ApiProperty({ description: 'Duration in minutes', default: 25 })
  @IsNumber() @Min(1) @Max(90)
  durationMinutes: number;

  @ApiPropertyOptional({ enum: ['work', 'break', 'long_break'] })
  @IsOptional() @IsIn(['work', 'break', 'long_break'])
  type?: string = 'work';
}

