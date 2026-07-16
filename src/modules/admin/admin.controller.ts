import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import { WalletService } from "../wallet/wallet.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser } from "../../common/decorators/user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("Admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "super_admin")
@ApiBearerAuth("access-token")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly walletService: WalletService,
  ) {}

  // ── Dashboard ─────────────────────────────────────────────

  @Get("dashboard")
  @ApiOperation({ summary: "Full ecosystem dashboard stats" })
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // ── Users ─────────────────────────────────────────────────

  @Get("users")
  @ApiOperation({ summary: "Full user list with filters" })
  users(@Query() query: any) {
    return this.adminService.getFullUserList(query);
  }

  @Patch("users/:id/ban")
  @ApiOperation({ summary: "Ban a user" })
  banUser(
    @Param("id") id: string,
    @CurrentUser("id") actorId: string,
    @Body("reason") reason: string,
  ) {
    return this.adminService.banUser(id, reason, actorId);
  }

  @Patch("users/:id/unban")
  @ApiOperation({ summary: "Unban a user" })
  unbanUser(@Param("id") id: string, @CurrentUser("id") actorId: string) {
    return this.adminService.unbanUser(id, actorId);
  }

  @Patch("users/:id/role")
  @Roles("super_admin")
  @ApiOperation({ summary: "Update user role (super admin only)" })
  updateRole(
    @Param("id") id: string,
    @CurrentUser("id") actorId: string,
    @Body("role") role: string,
  ) {
    return this.adminService.updateUserRole(id, role, actorId);
  }

  // ── Wallet ────────────────────────────────────────────────

  @Post("wallet/credit")
  @ApiOperation({ summary: "Manually credit a user's wallet" })
  creditWallet(
    @Body() body: { userId: string; amountKobo: number; description: string },
    @CurrentUser("id") actorId: string,
  ) {
    return this.walletService.credit({
      userId: body.userId,
      amountKobo: body.amountKobo,
      source: "ADMIN_CREDIT",
      description: body.description,
      metadata: { adminId: actorId },
    });
  }

  @Post("wallet/lock")
  @ApiOperation({ summary: "Lock a user's wallet" })
  lockWallet(@Body() body: { userId: string; reason: string }) {
    return this.adminService.lockWallet(body.userId, body.reason);
  }

  // ── Payments & Subscriptions ─────────────────────────────

  @Get("payments")
  @ApiOperation({ summary: "List payments" })
  payments(@Query() query: any) {
    return this.adminService.getPayments(query);
  }

  @Get("subscriptions")
  @ApiOperation({ summary: "List subscriptions" })
  subscriptions(@Query() query: any) {
    return this.adminService.getSubscriptions(query);
  }

  // ── Revenue ───────────────────────────────────────────────

  @Get("analytics/revenue")
  @ApiOperation({ summary: "Revenue time-series" })
  revenue(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("groupBy") groupBy: "day" | "week" | "month" = "day",
  ) {
    return this.adminService.getRevenueTimeSeries(from, to, groupBy);
  }

  // ── VibeCoders ────────────────────────────────────────────

  @Get("vibecoders/applicants")
  @ApiOperation({ summary: "List VibeCoders applicants" })
  vibecodersApplicants(@Query() query: any) {
    return this.adminService.getVibeCodersApplicants(query);
  }

  // ── Waitlist ──────────────────────────────────────────────

  @Get("waitlist")
  @ApiOperation({ summary: "Waitlist stats per product" })
  waitlist() {
    return this.adminService.getWaitlistStats();
  }

  @Post("waitlist/:productSlug/invite")
  @ApiOperation({ summary: "Invite next N users from a product waitlist" })
  invite(@Param("productSlug") slug: string, @Body("count") count = 10) {
    return this.adminService.inviteFromWaitlist(slug, +count);
  }

  // ── Audit logs ────────────────────────────────────────────

  @Get("logs")
  @ApiOperation({ summary: "Admin audit log" })
  logs(@Query("page") page = 1, @Query("limit") limit = 50) {
    return this.adminService.getAdminLogs(+page, +limit);
  }
}
