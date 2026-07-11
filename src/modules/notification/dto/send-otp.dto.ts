import { IsString, IsOptional, IsIn, IsNotEmpty } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export type OTPPurpose =
  | "phone_verify"
  | "email_verify"
  | "password_reset"
  | "login_2fa"
  | "transaction_confirm";
export type OTPChannel = "whatsapp" | "sms" | "email";

export class SendOtpDto {
  @ApiProperty({
    example: "+2348012345678",
    description: "E.164 phone, or an email address when purpose=email_verify",
  })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({
    example: "482913",
    description: "6-digit OTP code (already generated + hashed by AuthService)",
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    example: "phone_verify",
    enum: [
      "phone_verify",
      "email_verify",
      "password_reset",
      "login_2fa",
      "transaction_confirm",
    ],
  })
  @IsIn([
    "phone_verify",
    "email_verify",
    "password_reset",
    "login_2fa",
    "transaction_confirm",
  ])
  purpose: OTPPurpose;

  @ApiPropertyOptional({
    description: "Recipient's first name, for personalisation",
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    enum: ["whatsapp", "sms", "email"],
    description:
      "Force a specific channel instead of the default WhatsApp→SMS→email chain",
  })
  @IsOptional()
  @IsIn(["whatsapp", "sms", "email"])
  preferChannel?: OTPChannel;
}
