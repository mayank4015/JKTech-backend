import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { User } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { CookieService } from './services/cookie.service';
import { AppConfigService } from '../config/app-config.service';
import { JwtPayload } from './types/auth.types';
import { Role } from './types/role.types';

@Controller('auth')
export class AuthController {
  // In-memory cache to prevent concurrent refresh attempts for the same token
  private refreshInProgress = new Map<string, Promise<any>>();

  constructor(
    private readonly authService: AuthService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly cookieService: CookieService,
    private readonly jwtService: JwtService,
    private readonly configService: AppConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: { email: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );

    // Set both access and refresh token cookies
    if (result.refreshToken) {
      this.cookieService.setRefreshTokenCookie(response, result.refreshToken);
    }
    if (result.accessToken) {
      this.cookieService.setAccessTokenCookie(response, result.accessToken);
    }

    // Return access token and user data (but not the refresh token)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { refreshToken: _, ...responseData } = result;
    return responseData;
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: { email: string; password: string; name: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(registerDto);

    // Check if the result has tokens and set cookies
    if ('refreshToken' in result) {
      // Set both access and refresh token cookies
      this.cookieService.setRefreshTokenCookie(response, result.refreshToken);
      if ('accessToken' in result) {
        this.cookieService.setAccessTokenCookie(response, result.accessToken);
      }

      // Return access token and user data (but not the refresh token)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { refreshToken: _, ...responseData } = result;
      return responseData;
    }

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @GetUser() user: User & { tokenPayload?: any },
    @Res({ passthrough: true }) response: Response,
  ) {
    // Call Supabase logout with token payload for blacklisting
    const result = await this.authService.logout(user.tokenPayload);

    // Clear all HTTP-only cookies
    this.cookieService.clearAllAuthCookies(response);

    return result;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAllSessions(@GetUser() user: User) {
    // Logout all sessions for the current user
    const result = await this.authService.logoutAllSessions(user.id);
    return result;
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getProfile(@GetUser() user: User) {
    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Extract refresh token from cookies
    const refreshToken = request.cookies['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    let payload: JwtPayload;

    try {
      // Verify the refresh token
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.auth.jwtSecret,
      });

      console.log(
        `[REFRESH] Token verified for user: ${payload.sub}, JTI: ${payload.jti}`,
      );
    } catch (error) {
      console.log(`[REFRESH] Token verification failed:`, error.message);
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if there's already a refresh in progress for this token
    const refreshKey = payload.jti || refreshToken;
    if (this.refreshInProgress.has(refreshKey)) {
      console.log(
        `[REFRESH] Refresh already in progress for token: ${payload.jti}`,
      );
      try {
        // Wait for the existing refresh to complete
        const result = await this.refreshInProgress.get(refreshKey);
        // Set cookies for this response too
        this.cookieService.setRefreshTokenCookie(response, result.refreshToken);
        this.cookieService.setAccessTokenCookie(response, result.accessToken);
        return result;
      } catch (error) {
        // If the existing refresh failed, continue with a new one
        console.log(`[REFRESH] Existing refresh failed, starting new one`);
      }
    }

    // Create a promise for this refresh operation
    const refreshPromise = this.performTokenRefresh(payload, response);
    this.refreshInProgress.set(refreshKey, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      // Clean up the cache entry
      this.refreshInProgress.delete(refreshKey);
    }
  }

  private async performTokenRefresh(payload: JwtPayload, response: Response) {
    try {
      // Check if refresh token is blacklisted
      if (payload.jti) {
        const isBlacklisted =
          await this.tokenBlacklistService.isTokenBlacklisted(payload.jti);
        if (isBlacklisted) {
          console.log(`[REFRESH] Token is blacklisted: ${payload.jti}`);
          throw new UnauthorizedException('Refresh token has been revoked');
        }
        console.log(`[REFRESH] Token is not blacklisted: ${payload.jti}`);
      }

      // Find the user
      const user = await this.authService.findUserById(payload.sub);

      if (!user) {
        console.log(`[REFRESH] User not found: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      if (!user.isActive) {
        console.log(`[REFRESH] User account is deactivated: ${payload.sub}`);
        throw new UnauthorizedException('Account is deactivated');
      }

      console.log(`[REFRESH] Generating new tokens for user: ${user.id}`);

      // Generate new tokens FIRST
      const tokens = await this.authService.generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      console.log(`[REFRESH] New tokens generated successfully`);

      // Set both access and refresh token cookies
      this.cookieService.setRefreshTokenCookie(response, tokens.refreshToken);
      this.cookieService.setAccessTokenCookie(response, tokens.accessToken);

      console.log(`[REFRESH] Cookies set successfully`);

      // Only blacklist the old refresh token AFTER successful token generation and cookie setting
      if (payload.jti && payload.exp) {
        console.log(
          `[REFRESH] Scheduling blacklist for old token: ${payload.jti}`,
        );
        // Use a non-blocking approach with a small delay to ensure new tokens are processed
        setTimeout(() => {
          this.tokenBlacklistService
            .blacklistToken(payload.jti!, payload.exp!)
            .catch((error) => {
              // Log the error but don't fail the refresh process
              console.error(
                `Failed to blacklist old refresh token ${payload.jti}:`,
                error.message,
              );
            });
        }, 500); // 500ms delay to ensure new tokens are fully processed
      }

      console.log(
        `[REFRESH] Token refresh completed successfully for user: ${user.id}`,
      );

      // Return both tokens for middleware to handle properly
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      console.log(`[REFRESH] Error during refresh process:`, error.message);
      // If there's an error after token verification but before successful refresh,
      // don't blacklist the token so the user can retry
      throw error instanceof UnauthorizedException
        ? error
        : new UnauthorizedException('Token refresh failed');
    }
  }

  @Get('blacklist/stats')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getBlacklistStats() {
    const stats = await this.tokenBlacklistService.getBlacklistStats();
    return {
      message: 'Token blacklist statistics',
      data: stats,
    };
  }
}
