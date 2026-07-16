import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserMeController } from "./user-me.controller";
import { UserService } from "./user.service";
import { ReferralService } from "./referral.service";

@Module({
  controllers: [UserController, UserMeController],
  providers: [UserService, ReferralService],
  exports: [UserService, ReferralService],
})
export class UserModule {}
