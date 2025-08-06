import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async getHealth() {
    const startTime = Date.now();

    try {
      // Check database connectivity
      await this.prisma.healthCheck();

      const responseTime = Date.now() - startTime;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        database: 'connected',
        environment: process.env.NODE_ENV || 'development',
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        database: 'disconnected',
        environment: process.env.NODE_ENV || 'development',
        error: error.message,
      };
    }
  }

  @Public()
  @Get('database')
  async getDatabaseHealth() {
    try {
      await this.prisma.healthCheck();

      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}
