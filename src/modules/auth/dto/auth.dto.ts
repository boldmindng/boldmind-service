import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  Matches,
} from "class-validator";

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() name!: string;
  @IsOptional() @Matches(/^\+?[1-9]\d{7,14}$/) phone?: string;
  @IsOptional() @IsString() ecosystemRole?: string;
  @IsOptional() @IsString() referralCode?: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class RefreshTokenDto {
  @IsOptional() @IsString() refreshToken?: string; // falls back to boldmind_refresh cookie
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsEmail() email!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

// Internal — used by AuthService.verifyOtp() for both email + password-reset flows
export class VerifyOtpDto {
  @IsEmail() email!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsIn(["email_verify", "password_reset"]) purpose!:
    | "email_verify"
    | "password_reset";
}

// Public-facing — POST /auth/verify-email, email comes from the JWT, not the body
export class VerifyEmailDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class SendPhoneOtpDto {
  @Matches(/^\+?[1-9]\d{7,14}$/) phone!: string;
}

export class VerifyPhoneDto {
  @Matches(/^\+?[1-9]\d{7,14}$/) phone!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class Enable2faDto {
  @IsOptional() @Matches(/^\+?[1-9]\d{7,14}$/) phone?: string;
}

export class Verify2faDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

export class UpdateRoleDto {
  @IsString() role!: string;
}

export class Login2faDto {
  @IsString() pendingToken!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
