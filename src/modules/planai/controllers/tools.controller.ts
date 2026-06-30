import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CurrentUser } from "../../../common/decorators/user.decorator";
import { BizAgentService } from "../services/biz-agent.service";
import { ProjectManagerService } from "../services/project-manager.service";
import { PlanCRMService } from "../services/plan-crm.service";
import { HRPayrollService } from "../services/hr-payroll.service";
import { FitnessCenterService } from "../services/fitness-center.service";
import { MarketplaceService } from "../services/marketplace.service";
import {
  ConfigureAgentDto,
  AgentTaskDto,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  InviteMemberDto,
  CreateProjectDto,
  CreateTaskDto,
  UpdateTaskDto,
  StartPomodoroDto,
  CreateContactDto,
  CreateDealDto,
  CreateEmployeeDto,
  RunPayrollDto,
  CreateServiceListingDto,
  CreateDigitalProductDto,
  BookServiceDto,
} from "../dto/all-planai.dto";

import type { JwtPayload } from "../../auth/auth.service";
import { UpdateMemberRoleDto } from "../dto/project-manager.dto";

// ═════════════════════════════════════════════════════════════════════════════
// AI BUSINESS AGENT                           /planai/agent
// ═════════════════════════════════════════════════════════════════════════════

@ApiTags("PlanAI / AI Business Agent")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/agent")
export class BizAgentController {
  constructor(private readonly svc: BizAgentService) {}

  @Post("configure")
  @ApiOperation({ summary: "Configure AI agent with business context and FAQ" })
  configure(@CurrentUser() user: JwtPayload, @Body() dto: ConfigureAgentDto) {
    return this.svc.configureAgent(user.sub, dto);
  }

  @Get("status")
  @ApiOperation({ summary: "Get agent status, message count, and lead stats" })
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.svc.getAgentStatus(user.sub);
  }

  @Post("task")
  @ApiOperation({
    summary:
      "Trigger an autonomous agent task (invoice followup, order updates etc)",
  })
  runTask(@CurrentUser() user: JwtPayload, @Body() dto: AgentTaskDto) {
    return this.svc.runTask(user.sub, dto);
  }

  @Get("logs")
  @ApiOperation({ summary: "Recent conversations and leads handled by agent" })
  getLogs(@CurrentUser() user: JwtPayload) {
    return this.svc.getAgentLogs(user.sub);
  }

  @Get("briefing")
  @ApiOperation({ summary: "AI-generated daily business briefing" })
  getDailyBriefing(@CurrentUser() user: JwtPayload) {
    return this.svc.getDailyBriefing(user.sub);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PROJECT MANAGER                             /planai/projects
// ═════════════════════════════════════════════════════════════════════════════

@ApiTags("PlanAI / Project Manager")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/projects")
export class ProjectManagerController {
  constructor(private readonly svc: ProjectManagerService) {}

  // ── Workspaces ─────────────────────────────────────────────────────────────

  @Post("workspaces")
  @ApiOperation({ summary: "Create workspace" })
  createWorkspace(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.svc.createWorkspace(user.sub, dto);
  }

  @Get("workspaces")
  @ApiOperation({ summary: "List my workspaces" })
  getWorkspaces(@CurrentUser() user: JwtPayload) {
    return this.svc.getMyWorkspaces(user.sub);
  }

  @Get("workspaces/:id")
  @ApiOperation({ summary: "Get workspace details" })
  getWorkspace(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.svc.getWorkspace(id, user.sub);
  }

  @Patch("workspaces/:id")
  @ApiOperation({ summary: "Update workspace" })
  updateWorkspace(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.svc.updateWorkspace(id, user.sub, dto);
  }

  @Delete("workspaces/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete workspace (owner only)" })
  deleteWorkspace(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.svc.deleteWorkspace(id, user.sub);
  }

  // ── Members ────────────────────────────────────────────────────────────────

  @Post("workspaces/:id/members")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Invite member to workspace" })
  inviteMember(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: any,
  ) {
    return this.svc.inviteMember(id, user.sub, dto);
  }

  @Delete("workspaces/:id/members/:targetUserId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove member from workspace" })
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("targetUserId") targetUserId: string,
  ) {
    return this.svc.removeMember(id, user.sub, targetUserId);
  }

  @Patch("workspaces/:id/members/:targetUserId/role")
  @ApiOperation({ summary: "Update member role" })
  updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Param("targetUserId") targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.svc.updateMemberRole(id, user.sub, targetUserId, dto.role);
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  @Post("workspaces/:workspaceId/projects")
  @ApiOperation({ summary: "Create project inside workspace" })
  createProject(
    @CurrentUser() user: JwtPayload,
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.svc.createProject(workspaceId, user.sub, {
      name: dto.name,
      description: dto.description,
      color: dto.color,
    });
  }

  @Get("workspaces/:workspaceId/projects")
  @ApiOperation({ summary: "List workspace projects" })
  getProjects(
    @CurrentUser() user: JwtPayload,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.svc.getProjects(workspaceId, user.sub);
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  @Post("tasks")
  @ApiOperation({ summary: "Create task" })
  createTask(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.svc.createTask(dto.workspaceId, user.sub, dto);
  }

  @Get("workspaces/:workspaceId/tasks")
  @ApiOperation({ summary: "List workspace tasks with optional filters" })
  getTasks(
    @CurrentUser() user: JwtPayload,
    @Param("workspaceId") workspaceId: string,
    @Query("projectId") projectId?: string,
    @Query("status") status?: string,
    @Query("assigneeId") assigneeId?: string,
  ) {
    return this.svc.getTasks(workspaceId, user.sub, {
      projectId,
      status,
      assigneeId,
    });
  }

  @Patch("tasks/:taskId")
  @ApiOperation({ summary: "Update task" })
  updateTask(
    @CurrentUser() user: JwtPayload,
    @Param("taskId") taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.svc.updateTask(taskId, user.sub, dto);
  }

  @Delete("tasks/:taskId")
  @ApiOperation({ summary: "Archive task" })
  deleteTask(@CurrentUser() user: JwtPayload, @Param("taskId") taskId: string) {
    return this.svc.deleteTask(taskId, user.sub);
  }

  @Post("tasks/:taskId/breakdown")
  @ApiOperation({ summary: "AI breaks task into subtasks" })
  breakDownTask(
    @CurrentUser() user: JwtPayload,
    @Param("taskId") taskId: string,
  ) {
    return this.svc.breakDownTask(user.sub, taskId);
  }

  @Post("workspaces/:workspaceId/brain-dump")
  @ApiOperation({ summary: "Weekly brain dump → AI organises into tasks" })
  brainDump(
    @CurrentUser() user: JwtPayload,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { rawText: string },
  ) {
    return this.svc.processBrainDump(user.sub, workspaceId, body.rawText);
  }

  // ── Pomodoro ───────────────────────────────────────────────────────────────

  @Post("pomodoro/start")
  @ApiOperation({ summary: "Start Pomodoro session" })
  startPomodoro(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartPomodoroDto,
  ) {
    return this.svc.startPomodoro(user.sub, dto);
  }

  @Post("pomodoro/:sessionId/complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Complete Pomodoro session" })
  completePomodoro(
    @CurrentUser() user: JwtPayload,
    @Param("sessionId") sessionId: string,
    @Body() body: { interruptions?: number },
  ) {
    return this.svc.completePomodoro(
      user.sub,
      sessionId,
      body.interruptions ?? 0,
    );
  }

  @Get("pomodoro/stats")
  @ApiOperation({ summary: "Pomodoro focus stats" })
  pomodoroStats(@CurrentUser() user: JwtPayload) {
    return this.svc.getPomodoroStats(user.sub);
  }

  // ── Knowledge graph ────────────────────────────────────────────────────────

  @Post("knowledge")
  @ApiOperation({ summary: "Create knowledge node" })
  createNode(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      title: string;
      content: string;
      nodeType?: string;
      color?: string;
      tags?: string[];
      xPosition?: number;
      yPosition?: number;
      sourceUrl?: string;
    },
  ) {
    return this.svc.createKnowledgeNode(user.sub, body);
  }

  @Get("knowledge")
  @ApiOperation({ summary: "Get full knowledge graph" })
  getGraph(@CurrentUser() user: JwtPayload) {
    return this.svc.getKnowledgeGraph(user.sub);
  }

  // ── Meeting notes ──────────────────────────────────────────────────────────

  @Post("workspaces/:workspaceId/meeting-notes")
  @ApiOperation({
    summary: "Process meeting transcript → structured notes + tasks",
  })
  meetingNotes(
    @CurrentUser() user: JwtPayload,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { rawTranscript: string },
  ) {
    return this.svc.processMeetingNotes(
      user.sub,
      workspaceId,
      undefined,
      body.rawTranscript,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CRM                                         /planai/crm
// ═════════════════════════════════════════════════════════════════════════════

@ApiTags("PlanAI / CRM")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/crm")
export class PlanCRMController {
  constructor(private readonly svc: PlanCRMService) {}

  @Post("contacts")
  @ApiOperation({ summary: "Create contact" })
  createContact(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateContactDto,
  ) {
    return this.svc.createContact(user.sub, dto);
  }

  @Get("contacts")
  @ApiOperation({ summary: "List contacts with optional search" })
  getContacts(@CurrentUser() user: JwtPayload, @Query("q") search?: string) {
    return this.svc.getContacts(user.sub, search);
  }

  @Post("deals")
  @ApiOperation({ summary: "Create deal in pipeline" })
  createDeal(@CurrentUser() user: JwtPayload, @Body() dto: CreateDealDto) {
    return this.svc.createDeal(user.sub, dto);
  }

  @Patch("deals/:dealId/stage")
  @ApiOperation({ summary: "Move deal to new pipeline stage" })
  moveDeal(
    @CurrentUser() user: JwtPayload,
    @Param("dealId") dealId: string,
    @Body() body: { stage: string },
  ) {
    return this.svc.moveDeal(user.sub, dealId, body.stage);
  }

  @Get("pipeline")
  @ApiOperation({
    summary: "Pipeline summary with counts and ₦ values per stage",
  })
  getPipeline(@CurrentUser() user: JwtPayload) {
    return this.svc.getPipelineSummary(user.sub);
  }

  @Get("contacts/:contactId/next-action")
  @ApiOperation({ summary: "AI next-best-action recommendation for contact" })
  getNextAction(
    @CurrentUser() user: JwtPayload,
    @Param("contactId") contactId: string,
  ) {
    return this.svc.getAINextAction(user.sub, contactId);
  }

  @Get("churn-risk")
  @ApiOperation({ summary: "Customers at churn risk (60+ days inactive)" })
  getChurnRisk(@CurrentUser() user: JwtPayload) {
    return this.svc.getChurnRisk(user.sub);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HR & PAYROLL                                /planai/hr
// ═════════════════════════════════════════════════════════════════════════════

@ApiTags("PlanAI / HR & Payroll")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/hr")
export class HRPayrollController {
  constructor(private readonly svc: HRPayrollService) {}

  @Post("employees")
  @ApiOperation({
    summary: "Add employee with auto PAYE / pension computation",
  })
  createEmployee(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.svc.createEmployee(user.sub, dto);
  }

  @Get("employees")
  @ApiOperation({ summary: "List all active employees" })
  getEmployees(@CurrentUser() user: JwtPayload) {
    return this.svc.getEmployees(user.sub);
  }

  @Patch("employees/:empId/terminate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Offboard / terminate employee" })
  terminateEmployee(
    @CurrentUser() user: JwtPayload,
    @Param("empId") empId: string,
  ) {
    return this.svc.terminateEmployee(user.sub, empId);
  }

  @Post("payroll/run")
  @ApiOperation({
    summary: "Run monthly payroll with PAYE, pension, NHF deductions",
  })
  runPayroll(@CurrentUser() user: JwtPayload, @Body() dto: RunPayrollDto) {
    return this.svc.runPayroll(user.sub, dto);
  }

  @Post("leave")
  @ApiOperation({ summary: "Submit leave request" })
  requestLeave(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      empId: string;
      leaveType: "annual" | "sick" | "maternity" | "paternity" | "unpaid";
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    return this.svc.requestLeave(user.sub, body);
  }

  @Get("employees/:empId/leave-balance")
  @ApiOperation({ summary: "Get employee leave balance" })
  getLeaveBalance(
    @CurrentUser() user: JwtPayload,
    @Param("empId") empId: string,
  ) {
    return this.svc.getLeaveBalance(user.sub, empId);
  }

  @Post("tools/job-description")
  @ApiOperation({ summary: "AI generate job description" })
  generateJD(
    @CurrentUser() user: JwtPayload,
    @Body() body: { role: string; department: string; salaryRangeNGN?: string },
  ) {
    return this.svc.generateJobDescription(user.sub, body);
  }

  @Post("tools/query-letter")
  @ApiOperation({ summary: "Generate formal employee query letter" })
  generateQueryLetter(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      employeeName: string;
      offence: string;
      incidentDate: string;
      details: string;
    },
  ) {
    return this.svc.generateQueryLetter(user.sub, body);
  }

  @Post("tools/deductions-calc")
  @ApiOperation({
    summary: "Compute PAYE / pension / NHF for a salary (no auth needed)",
  })
  calcDeductions(@Body() body: { monthlySalaryNGN: number }) {
    return this.svc.computeDeductions(body.monthlySalaryNGN);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FITNESS CENTER                              /planai/fitness
// ═════════════════════════════════════════════════════════════════════════════

@ApiTags("PlanAI / Fitness Center")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/fitness")
export class FitnessCenterController {
  constructor(private readonly svc: FitnessCenterService) {}

  // @Post("profile")
  // @ApiOperation({ summary: "Create or update fitness profile" })
  // upsertProfile(
  //   @CurrentUser() user: JwtPayload,
  //   @Body()
  //   body: {
  //     goal: string;
  //     fitnessLevel?: string;
  //     weightKg?: number;
  //     heightCm?: number;
  //     targetWeightKg?: number;
  //     age?: number;
  //     gender?: string;
  //     activityLevel?: string;
  //     hasGymAccess?: boolean;
  //     dietaryPrefs?: string[];
  //     allergies?: string[];
  //   },
  // ) {
  //   return this.svc.upsertProfile(user.sub, body);
  // }

  // @Get("profile")
  // @ApiOperation({
  //   summary: "Get fitness profile with streak and recent workouts",
  // })
  // getProfile(@CurrentUser() user: JwtPayload) {
  //   return this.svc.getProfile(user.sub);
  // }

  @Get("plan")
  @ApiOperation({ summary: "Generate AI workout plan tailored to profile" })
  generatePlan(@CurrentUser() user: JwtPayload) {
    return this.svc.generateWorkoutPlan(user.sub);
  }

  @Post("workouts/log")
  @ApiOperation({ summary: "Log a completed workout" })
  logWorkout(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      workoutName?: string;
      type?: any;
      durationMinutes: number;
      exercises?: unknown[];
      caloriesBurned?: number;
      mood?: string;
      notes?: string;
      date?: string;
    },
  ) {
    return this.svc.logWorkout(user.sub, body);
  }

  @Post("meals/log")
  @ApiOperation({
    summary: "Log a meal — includes 500+ Nigerian dish database",
  })
  logMeal(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      mealName: string;
      mealType: string;
      servingSize?: number;
      isNigerianDish?: boolean;
      imageUrl?: string;
      notes?: string;
      date?: string;
    },
  ) {
    return this.svc.logMeal(user.sub, body);
  }

  @Get("meals/nutrition/:dish")
  @ApiOperation({ summary: "Get nutritional info for a Nigerian dish" })
  getNutrition(
    @Param("dish") dish: string,
    @Query("servings") servings?: string,
  ) {
    return this.svc.getNigerianNutrition(dish, servings ? Number(servings) : 1);
  }

  @Get("meals/daily")
  @ApiOperation({ summary: "Daily nutrition summary with macro split" })
  getDailyNutrition(
    @CurrentUser() user: JwtPayload,
    @Query("date") date?: string,
  ) {
    return this.svc.getDailyNutrition(user.sub, date);
  }

  @Post("coach")
  @ApiOperation({ summary: "Chat with AI wellness coach (Nigerian context)" })
  askCoach(
    @CurrentUser() user: JwtPayload,
    @Body() body: { question: string },
  ) {
    return this.svc.getAICoachAdvice(user.sub, body.question);
  }

  @Post("metrics")
  @ApiOperation({ summary: "Log body measurements" })
  logMetrics(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      weight?: number;
      bodyFat?: number;
      muscleMass?: number;
      notes?: string;
    },
  ) {
    return this.svc.logBodyMetrics(user.sub, body);
  }

  @Get("progress")
  @ApiOperation({ summary: "Progress history for last N weeks" })
  getProgress(@CurrentUser() user: JwtPayload, @Query("weeks") weeks?: string) {
    return this.svc.getProgressHistory(user.sub, weeks ? Number(weeks) : 12);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MARKETPLACE                                 /planai/marketplace
// ═════════════════════════════════════════════════════════════════════════════

@ApiTags("PlanAI / Marketplace")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/marketplace")
export class MarketplaceController {
  constructor(private readonly svc: MarketplaceService) {}

  // ── Services ───────────────────────────────────────────────────────────────

  @Post("services")
  @ApiOperation({ summary: "Create service listing (AI-enhanced description)" })
  createListing(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateServiceListingDto,
  ) {
    return this.svc.createServiceListing(user.sub, dto);
  }

  @Get("services")
  @ApiOperation({ summary: "Browse service listings with filters" })
  getListings(
    @Query()
    filters: {
      category?: string;
      state?: string;
      minPriceNGN?: number;
      maxPriceNGN?: number;
      page?: number;
      limit?: number;
    },
  ) {
    return this.svc.getServiceListings(filters);
  }

  @Post("services/:listingId/book")
  @ApiOperation({ summary: "Book service with Paystack escrow" })
  bookService(
    @CurrentUser() user: JwtPayload,
    @Param("listingId") listingId: string,
    @Body() dto: BookServiceDto,
  ) {
    return this.svc.bookService(user.sub, { ...dto, listingId });
  }

  // ── Digital products ───────────────────────────────────────────────────────

  @Post("digital")
  @ApiOperation({ summary: "Create digital product listing" })
  createDigitalProduct(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDigitalProductDto,
  ) {
    return this.svc.createDigitalProduct(user.sub, dto);
  }

  @Post("digital/:productId/purchase")
  @ApiOperation({ summary: "Purchase digital product (escrow or free)" })
  purchaseDigital(
    @CurrentUser() user: JwtPayload,
    @Param("productId") productId: string,
  ) {
    return this.svc.purchaseDigitalProduct(user.sub, productId);
  }

  // ── Logistics ──────────────────────────────────────────────────────────────

  @Get("shipping/rates")
  @ApiOperation({ summary: "Get GIG Logistics shipping rates" })
  getShippingRates(
    @Query("originState") originState: string,
    @Query("destinationState") destinationState: string,
    @Query("weightKg") weightKg: string,
  ) {
    return this.svc.getShippingRates({
      originState,
      destinationState,
      weightKg: Number(weightKg),
    });
  }

  @Post("shipping/create")
  @ApiOperation({ summary: "Create GIG shipment waybill" })
  createShipment(
    @Body() body: Parameters<MarketplaceService["createShipment"]>[0],
  ) {
    return this.svc.createShipment(body);
  }

  @Get("shipping/track/:waybill")
  @ApiOperation({ summary: "Track GIG shipment" })
  trackShipment(@Param("waybill") waybill: string) {
    return this.svc.trackShipment(waybill);
  }

  // ── Seller dashboard ───────────────────────────────────────────────────────

  @Get("seller/dashboard")
  @ApiOperation({ summary: "Seller dashboard — listings, bookings, earnings" })
  getSellerDashboard(@CurrentUser() user: JwtPayload) {
    return this.svc.getSellerDashboard(user.sub);
  }
}
