import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { User } from '@prisma/client';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { CookieService } from './services/cookie.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieService: CookieService,
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

  @Post('profile')
  async getProfile(@GetUser() user: User) {
    return { user };
  }
}
