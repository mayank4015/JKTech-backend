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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

    // Set HTTP-only cookie
    response.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    return {
      user: result.user,
      message: 'Login successful',
    };
  }

  @Public()
  @Post('register')
  async register(
    @Body() registerDto: { email: string; password: string; name: string },
  ) {
    return this.authService.register(registerDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) response: Response) {
    // Call Supabase logout
    const result = await this.authService.logout();

    // Clear HTTP-only cookie
    response.clearCookie('access_token');

    return result;
  }

  @Post('profile')
  async getProfile(@GetUser() user: User) {
    return { user };
  }
}
