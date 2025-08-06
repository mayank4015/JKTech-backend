import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import { AppConfigModule } from '../../config/app-config.module';
import { AppConfigService } from '../../config/app-config.service';
import { ProvidersModule } from '../providers/providers.module';

import { LoggerService } from './logger.service';

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

        if (isProduction) {
          // Application logs
          transports.push(
            new DailyRotateFile({
              filename: 'logs/application-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '14d',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
          );

          // Error logs
          transports.push(
            new DailyRotateFile({
              filename: 'logs/error-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '30d',
              level: 'error',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
          );

          // Trace logs
          transports.push(
            new DailyRotateFile({
              filename: 'logs/trace-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '7d',
              format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
              ),
            }),
          );
        }

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
            ...(isProduction
              ? [
                  new DailyRotateFile({
                    filename: 'logs/exceptions-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '30d',
                  }),
                ]
              : []),
          ],
          rejectionHandlers: [
            new winston.transports.Console(),
            ...(isProduction
              ? [
                  new DailyRotateFile({
                    filename: 'logs/rejections-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '30d',
                  }),
                ]
              : []),
          ],
        };
      },
      inject: [AppConfigService],
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
