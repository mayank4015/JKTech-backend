import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { LoggerModule } from '../common/logger/logger.module';
import { SupabaseModule } from '../common/supabase/supabase.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RoleGuard } from './guards/role.guard';
import { CookieService } from './services/cookie.service';
import { UserProfileService } from './services/user-profile.service';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    LoggerModule,
    SupabaseModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      useFactory: (configService: AppConfigService) => ({
        secret: configService.getJwtSecret(),
        signOptions: {
          expiresIn: configService.getJwtExpiresIn(),
        },
      }),
      inject: [AppConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RoleGuard,
    CookieService,
    UserProfileService,
  ],
  exports: [AuthService, JwtAuthGuard, RoleGuard],
})
export class AuthModule {}
