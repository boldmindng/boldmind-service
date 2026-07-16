import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { HubService } from "./hub.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/user.decorator";
import { JwtPayload } from "../auth/auth.service";

@ApiTags("Hub")
@Controller("hub")
export class HubController {
  constructor(private readonly hubService: HubService) {}

  @Public()
  @Get("ecosystem")
  @ApiOperation({ summary: "Full ecosystem map (BOLDMIND_PRODUCTS)" })
  getEcosystem() {
    return this.hubService.getEcosystem();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @Get("products")
  @ApiOperation({ summary: "Products the current user has access to" })
  getProducts(@CurrentUser() user: JwtPayload) {
    return this.hubService.getUserProducts(user.sub);
  }

  @Public()
  @Get("pricing")
  @ApiOperation({ summary: "Get pricing plans" })
  getPricing() {
    return this.hubService.getPricing();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @Get("dashboard")
  @ApiOperation({
    summary:
      "Hub dashboard — subscriptions, recent activity, product access, wallet balance",
  })
  getDashboardStats(@CurrentUser() user: JwtPayload) {
    return this.hubService.getDashboardStats(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @Post("referral/generate")
  @ApiOperation({ summary: "Generate my referral code + link" })
  generateReferral(@CurrentUser() user: JwtPayload) {
    return this.hubService.generateReferral(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @Get("referral/stats")
  @ApiOperation({ summary: "My referral stats" })
  getReferralStats(@CurrentUser() user: JwtPayload) {
    return this.hubService.getReferralStats(user.sub);
  }

  @Public()
  @Get("waitlist/:productSlug")
  @ApiOperation({ summary: "Waitlist position for an email" })
  getWaitlistPosition(
    @Param("productSlug") productSlug: string,
    @Query("email") email: string,
  ) {
    return this.hubService.getWaitlistPosition(productSlug, email);
  }

  @Public()
  @Post("waitlist/:productSlug")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Join a product waitlist" })
  joinWaitlist(
    @Param("productSlug") productSlug: string,
    @Body() body: { email: string; name?: string },
  ) {
    return this.hubService.joinWaitlist(productSlug, body.email, body.name);
  }

  @Public()
  @Get("changelog")
  @ApiOperation({ summary: "Public changelog feed" })
  getChangelog(@Query("page") page = 1, @Query("pageSize") pageSize = 20) {
    return this.hubService.getChangelog(+page, +pageSize);
  }

  @Public()
  @Get("status")
  @ApiOperation({ summary: "System uptime + incidents" })
  getStatus() {
    return this.hubService.getSystemStatus();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "super_admin", "manager")
  @ApiBearerAuth("access-token")
  @Get("team")
  @ApiOperation({ summary: "Get team members" })
  getTeam() {
    return this.hubService.getTeam();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "super_admin")
  @ApiBearerAuth("access-token")
  @Post("team/invite")
  @ApiOperation({ summary: "Invite a team member" })
  inviteTeamMember(
    @Body() body: { email: string; role: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.hubService.inviteTeamMember(body.email, body.role, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "super_admin")
  @ApiBearerAuth("access-token")
  @Delete("team/:userId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a team member" })
  removeTeamMember(
    @Param("userId") userId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.hubService.removeTeamMember(userId, actor.sub);
  }
}
