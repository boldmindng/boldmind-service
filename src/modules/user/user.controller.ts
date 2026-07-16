import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UserService } from "./user.service";
import {
  UpdateUserDto,
  UpdateProfileDto,
  UserQueryDto,
  OnboardingDto,
} from "./user.dto";
import { JwtPayload } from "../auth/auth.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser } from "../../common/decorators/user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("Users")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles("admin", "super_admin")
  @ApiOperation({ summary: "List all users (admin)" })
  findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  @Get("dashboard")
  @ApiOperation({ summary: "Get current user dashboard" })
  dashboard(@CurrentUser("id") userId: string) {
    return this.userService.getUserDashboard(userId);
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "super_admin")
  @ApiOperation({ summary: "Get user by ID (admin)" })
  findOne(@Param("id") id: string) {
    return this.userService.findById(id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "super_admin")
  @ApiOperation({
    summary: "Update user — role / isActive / isBanned / banReason (admin)",
  })
  update(
    @Param("id") id: string,
    @CurrentUser("id") actorId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(id, actorId, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("admin", "super_admin")
  @ApiOperation({ summary: "Delete user (admin)" })
  remove(@Param("id") id: string, @CurrentUser("id") actorId: string) {
    return this.userService.deleteUser(id, actorId);
  }

  @Get(":id/subscriptions")
  @UseGuards(RolesGuard)
  @Roles("admin", "super_admin")
  @ApiOperation({ summary: "Get a user's subscriptions (admin)" })
  subscriptions(@Param("id") id: string) {
    return this.userService.getUserSubscriptions(id);
  }

  @Get(":id/activity")
  @UseGuards(RolesGuard)
  @Roles("admin", "super_admin")
  @ApiOperation({ summary: "Get user activity log (admin)" })
  activity(
    @Param("id") id: string,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
  ) {
    return this.userService.getActivityLog(id, +page, +pageSize);
  }

  @Patch(":id/profile")
  @UseGuards(RolesGuard)
  @Roles("admin", "super_admin")
  @ApiOperation({ summary: "Update a user's profile (admin)" })
  updateProfile(@Param("id") id: string, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(id, dto);
  }

  @Post("onboarding")
  @ApiOperation({ summary: "Complete user onboarding" })
  completeOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body() dto: OnboardingDto,
  ) {
    return this.userService.completeOnboarding(user.sub, dto);
  }
}
