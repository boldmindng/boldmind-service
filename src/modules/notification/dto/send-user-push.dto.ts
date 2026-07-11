import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { SendPushDto } from "./send-push.dto";

export class SendUserPushDto extends SendPushDto {
  @ApiProperty({ description: "Target user ID (Prisma User.id)" })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
