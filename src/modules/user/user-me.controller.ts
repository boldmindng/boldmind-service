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
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UserService } from "./user.service";
import { UpdateProfileDto, OnboardingDto } from "./user.dto";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../../common/decorators/user.decorator";
import { JwtPayload } from "../auth/auth.service";

@ApiTags("User (self)")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
@Controller("users/me")
export class UserMeController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: "Get current user + profile" })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.userService.findById(user.sub);
  }

  @Patch()
  @ApiOperation({
    summary: "Update current user — name / phone / ecosystemRole",
  })
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { name?: string; phone?: string; ecosystemRole?: string },
  ) {
    return this.userService.updateMe(user.sub, dto);
  }

  @Get("profile")
  @ApiOperation({ summary: "Get current user profile" })
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.userService.getProfile(user.sub);
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update current user profile" })
  updateMyProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(user.sub, dto);
  }

  @Patch("avatar")
  @ApiOperation({
    summary: "Update avatar URL (after upload via /media/upload)",
  })
  updateAvatar(
    @CurrentUser() user: JwtPayload,
    @Body("avatarUrl") avatarUrl: string,
  ) {
    return this.userService.updateAvatar(user.sub, avatarUrl);
  }

  @Get("products")
  @ApiOperation({ summary: "Get my active products / subscriptions" })
  getMyProducts(@CurrentUser() user: JwtPayload) {
    return this.userService.getUserProducts(user.sub);
  }

  @Get("notifications")
  @ApiOperation({ summary: "Get my in-app notifications" })
  getMyNotifications(
    @CurrentUser() user: JwtPayload,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
    @Query("read") read?: string,
  ) {
    const readFilter = read === undefined ? undefined : read === "true";
    return this.userService.getNotifications(
      user.sub,
      +page,
      +pageSize,
      readFilter,
    );
  }

  @Patch("notifications/read-all")
  @ApiOperation({ summary: "Mark all notifications as read" })
  markAllNotificationsRead(@CurrentUser() user: JwtPayload) {
    return this.userService.markAllNotificationsRead(user.sub);
  }

  @Patch("notifications/:id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  markNotificationRead(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
  ) {
    return this.userService.markNotificationRead(user.sub, id);
  }

  @Get("activity")
  @ApiOperation({ summary: "Get my activity log" })
  getMyActivity(
    @CurrentUser() user: JwtPayload,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
    @Query("productSlug") productSlug?: string,
  ) {
    return this.userService.getActivityLog(
      user.sub,
      +page,
      +pageSize,
      productSlug,
    );
  }

  @Post("onboarding")
  @ApiOperation({ summary: "Complete onboarding" })
  completeOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body() dto: OnboardingDto,
  ) {
    return this.userService.completeOnboarding(user.sub, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete my account — queues NDPA erasure" })
  deleteAccount(
    @CurrentUser() user: JwtPayload,
    @Body("confirmEmail") confirmEmail: string,
  ) {
    return this.userService.requestErasure(user.sub, confirmEmail);
  }
}
