import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import { AppConfigModule } from '../../config/app-config.module';
import { AppConfigService } from '../../config/app-config.service';
import { ProvidersModule } from '../providers/providers.module';

import { LoggerService } from './logger.service';
import { HttpLoggerService } from './http-logger.service';

@Module({
  imports: [
    AppConfigModule,
    ProvidersModule,
    WinstonModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (configService: AppConfigService) => {
        const isProduction = configService.isProduction();

        const transports: winston.transport[] = [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.colorize(),
              winston.format.printf(
                ({ timestamp, level, message, context, trace, ...meta }) => {
                  const contextStr = context ? `[${context}] ` : '';
                  const metaStr = Object.keys(meta).length
                    ? ` ${JSON.stringify(meta)}`
                    : '';
                  const traceStr = trace ? `\n${trace}` : '';
                  return `${timestamp} ${level}: ${contextStr}${message}${metaStr}${traceStr}`;
                },
              ),
            ),
          }),
        ];

        // System logs (NestJS startup, module initialization, etc.) - Single persistent file
        transports.push(
          new winston.transports.File({
            filename: 'logs/system.log',
            maxsize: 50 * 1024 * 1024, // 50MB max file size
            maxFiles: 5, // Keep 5 backup files
            tailable: true,
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
            ),
          }),
        );

        // System error logs - Single persistent file
        transports.push(
          new winston.transports.File({
            filename: 'logs/error.log',
            maxsize: 50 * 1024 * 1024, // 50MB max file size
            maxFiles: 5, // Keep 5 backup files
            tailable: true,
            level: 'error',
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json(),
            ),
          }),
        );

        return {
          level: isProduction ? 'info' : 'debug',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
          transports,
          exceptionHandlers: [
            new winston.transports.Console(),
            new winston.transports.File({
              filename: 'logs/exceptions.log',
              maxsize: 50 * 1024 * 1024, // 50MB max file size
              maxFiles: 5,
              tailable: true,
            }),
          ],
          rejectionHandlers: [
            new winston.transports.Console(),
            new winston.transports.File({
              filename: 'logs/rejections.log',
              maxsize: 50 * 1024 * 1024, // 50MB max file size
              maxFiles: 5,
              tailable: true,
            }),
          ],
        };
      },
      inject: [AppConfigService],
    }),
  ],
  providers: [LoggerService, HttpLoggerService],
  exports: [LoggerService, HttpLoggerService],
})
export class LoggerModule {}
