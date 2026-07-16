import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { HealthController } from "./health.controller";
import { Post, PostSchema } from "../amebogist/schemas/post.schema";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    WalletModule,
  ],
  controllers: [AdminController, HealthController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
