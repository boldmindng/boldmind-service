import { Module } from "@nestjs/common";
import { HubController } from "./hub.controller";
import { HubService } from "./hub.service";
import { DatabaseModule } from "../../database/database.module";
import { UserModule } from "../user/user.module";

@Module({
  imports: [DatabaseModule, UserModule],
  controllers: [HubController],
  providers: [HubService],
  exports: [HubService],
})
export class HubModule {}
