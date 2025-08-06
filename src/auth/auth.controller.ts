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
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { CookieService } from './services/cookie.service';
import { AppConfigService } from '../config/app-config.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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

    // Set refresh token cookie
    if (result.refreshToken) {
      this.cookieService.setRefreshTokenCookie(response, result.refreshToken);
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

    // Check if the result has a refreshToken property
    if ('refreshToken' in result) {
      // Set refresh token cookie
      this.cookieService.setRefreshTokenCookie(response, result.refreshToken);

      // Return access token and user data (but not the refresh token)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { refreshToken: _, ...responseData } = result;
      return responseData;
    }

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    // Call Supabase logout
    const result = await this.authService.logout();

    // Clear HTTP-only cookies
    this.cookieService.clearRefreshTokenCookie(response);

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
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.auth.jwtSecret,
      });

      // Find the user
      const user = await this.authService.findUserById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new tokens
      const tokens = await this.authService.generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      // Set the new refresh token cookie
      this.cookieService.setRefreshTokenCookie(response, tokens.refreshToken);

      // Return the new access token (but not the refresh token)
      return {
        accessToken: tokens.accessToken,
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
}
