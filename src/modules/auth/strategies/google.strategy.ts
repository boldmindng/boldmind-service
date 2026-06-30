
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { AuthProvider } from '@boldmindng/utils';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService, private readonly authService: AuthService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: { id: string; emails: Array<{ value: string }>; displayName: string; photos?: Array<{ value: string }> },
    done: VerifyCallback,
  ) {
    // Read the redirect URL stored in a short-lived cookie set before the OAuth redirect
    const redirectUrl = (req.cookies?.['oauth_redirect'] as string) || '';

    const tokens = await this.authService.handleOAuthLogin({
      providerId: profile.id,
      provider: 'google' as AuthProvider,
      email: profile.emails[0]?.value ?? '',
      name: profile.displayName,
      avatar: profile.photos?.[0]?.value,
    });
    done(null, { ...tokens, redirectUrl });
  }
}