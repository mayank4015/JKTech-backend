import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Cookie service
 *
 * Centralizes cookie management for authentication
 */
@Injectable()
export class CookieService {
  private readonly logger = new Logger(CookieService.name);

  constructor(private readonly configService: AppConfigService) {}

  /**
   * Set access token as HTTP-only cookie
   * @param res Express response object
   * @param accessToken Access token
   */
  setAccessTokenCookie(res: Response, accessToken: string): void {
    this.logger.debug('Setting access token cookie');

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // Use 'lax' in development
      maxAge: 60 * 60 * 1000, // 1 hour (match JWT expiration)
      path: '/',
    });
  }

  /**
   * Set refresh token as HTTP-only cookie
   * @param res Express response object
   * @param refreshToken Refresh token
   */
  setRefreshTokenCookie(res: Response, refreshToken: string): void {
    this.logger.debug('Setting refresh token cookie');

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // Use 'lax' in development
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  /**
   * Clear access token cookie
   * @param res Express response object
   */
  clearAccessTokenCookie(res: Response): void {
    this.logger.debug('Clearing access token cookie');

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // Use 'lax' in development
      path: '/',
    });
  }

  /**
   * Clear refresh token cookie
   * @param res Express response object
   */
  clearRefreshTokenCookie(res: Response): void {
    this.logger.debug('Clearing refresh token cookie');

    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // Use 'lax' in development
      path: '/',
    });
  }

  /**
   * Clear all authentication cookies
   * @param res Express response object
   */
  clearAllAuthCookies(res: Response): void {
    this.logger.debug('Clearing all authentication cookies');
    this.clearAccessTokenCookie(res);
    this.clearRefreshTokenCookie(res);
  }
}
