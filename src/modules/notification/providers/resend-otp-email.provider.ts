// src/modules/notification/providers/resend-otp-email.provider.ts
//
// Concrete EmailOTPProvider implementation for the email_verify fallback step
// inside @boldmindng/sms OTPService (see packages/sms/src/otp.service.ts §Step 3).
//
// The sms package intentionally only depends on the EmailOTPProvider *interface*
// (packages/sms/src/types.ts) so it never imports @boldmindng/email or Resend
// directly. This adapter is the concrete implementation boldmind-service wires
// in at module init (see notification.module.ts) — it reuses the same
// VerifyEmail template as NotificationService.sendOtpEmail() so both paths
// render identical email copy.

import { Resend } from "resend";
import { render } from "@react-email/render";
import { VerifyEmail } from "@boldmindng/email";
import type { EmailOTPProvider, OTPPurpose } from "@boldmindng/sms";

export class ResendOtpEmailProvider implements EmailOTPProvider {
  constructor(
    private readonly resend: Resend,
    private readonly fromEmail: string,
  ) {}

  async sendOTP(params: {
    to: string;
    code: string;
    name?: string;
    purpose: OTPPurpose;
  }): Promise<string> {
    const html = await render(
      VerifyEmail({
        fullName: params.name?.trim() || "there",
        verificationCode: params.code,
      }),
    );

    const result = await this.resend.emails.send({
      from: this.fromEmail,
      to: [params.to],
      subject: "Your BoldMind OTP Code",
      html,
      text: `Your OTP is ${params.code}. Expires in 30 minutes.`,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data?.id ?? "resend-unknown";
  }
}
