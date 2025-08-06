import { Injectable } from '@nestjs/common';
import { Response } from 'express';

import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class CookieService {
  constructor(private configService: AppConfigService) {}

  setAccessTokenCookie(response: Response, token: string): void {
    const isProduction = this.configService.isProduction();

    response.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/',
    });
  }

  setRefreshTokenCookie(response: Response, token: string): void {
    const isProduction = this.configService.isProduction();

    response.cookie('refresh_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/auth/refresh',
    });
  }

  clearAuthCookies(response: Response): void {
    response.clearCookie('access_token', { path: '/' });
    response.clearCookie('refresh_token', { path: '/auth/refresh' });
  }
}
