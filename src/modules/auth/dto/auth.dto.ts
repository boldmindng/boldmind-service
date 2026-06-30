import {
  IsEmail, IsString, MinLength, MaxLength, IsOptional,
  IsEnum, IsIn, Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
 
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])/;
 
export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;
 
  @IsEmail() @Transform(({ value }) => (value as string).toLowerCase())
  email: string;
 
  @IsString() @MinLength(8) @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: 'Password must contain uppercase, lowercase, number, and special character' })
  password: string;
 
  @IsOptional()
  @IsIn(['hustler', 'founder', 'creator', 'student', 'business_owner', 'operator', 'partner', 'vibe-coder'])
  ecosystemRole?: string;
 
  @IsOptional() @IsString() @MaxLength(20)
  referralCode?: string;
}
 
export class LoginDto {
  @IsEmail() @Transform(({ value }) => (value as string).toLowerCase())
  email: string;
 
  @IsString() @MinLength(1)
  password: string;
}
 
export class RefreshTokenDto {
  @IsString() @MinLength(10)
  refreshToken: string;
}
 
export class ForgotPasswordDto {
  @IsEmail() @Transform(({ value }) => (value as string).toLowerCase())
  email: string;
}
 
export class ResetPasswordDto {
  @IsEmail() @Transform(({ value }) => (value as string).toLowerCase())
  email: string;
 
  @IsString() @MinLength(6) @MaxLength(6)
  code: string;
 
  @IsString() @MinLength(8) @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: 'Password must contain uppercase, lowercase, number, and special character' })
  newPassword: string;
}
 
export class VerifyOtpDto {
  @IsEmail() @Transform(({ value }) => (value as string).toLowerCase())
  email: string;
 
  @IsString() @MinLength(6) @MaxLength(6)
  code: string;
 
  @IsIn(['email_verify', 'phone_verify', 'password_reset', '2fa'])
  purpose: string;
}
 
export class ChangePasswordDto {
  @IsString() @MinLength(1)
  currentPassword: string;
 
  @IsString() @MinLength(8) @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: 'Password must contain uppercase, lowercase, number, and special character' })
  newPassword: string;
}
 
export class UpdateRoleDto {
  @IsIn([
    'super_admin', 'admin', 'manager', 'editor', 'support', 'analyst',
    'hustler', 'founder', 'creator', 'student', 'business_owner', 'operator', 'partner', 'guest', 'vibe-coder'
  ])
  role: string;
}
