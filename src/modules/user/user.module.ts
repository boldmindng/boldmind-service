import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserMeController } from './user-me.controller';
import { UserService } from './user.service';

@Module({
  controllers: [UserController, UserMeController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}