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

    try {
      // Verify the refresh token
      const payload: JwtPayload = await this.jwtService.verifyAsync(
        refreshToken,
        {
          secret: this.configService.auth.jwtSecret,
        },
      );

      // Check if refresh token is blacklisted
      if (payload.jti) {
        const isBlacklisted =
          await this.tokenBlacklistService.isTokenBlacklisted(payload.jti);
        if (isBlacklisted) {
          throw new UnauthorizedException('Refresh token has been revoked');
        }
      }

      // Find the user
      const user = await this.authService.findUserById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Blacklist the old refresh token
      if (payload.jti && payload.exp) {
        await this.tokenBlacklistService.blacklistToken(
          payload.jti,
          payload.exp,
        );
      }

      // Generate new tokens
      const tokens = await this.authService.generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      // Set both access and refresh token cookies
      this.cookieService.setRefreshTokenCookie(response, tokens.refreshToken);
      this.cookieService.setAccessTokenCookie(response, tokens.accessToken);

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
      throw new UnauthorizedException('Invalid refresh token');
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
