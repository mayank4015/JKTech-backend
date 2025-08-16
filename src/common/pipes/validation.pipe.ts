import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { LoggerService } from '../logger/logger.service';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  private readonly logger = new Logger(ValidationPipe.name);

  constructor(private readonly loggerService: LoggerService) {}

  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });

    if (errors.length > 0) {
      const formattedErrors = this.formatErrors(errors);

      this.loggerService.logError(
        new Error('Validation failed'),
        ValidationPipe.name,
        {
          validationErrors: formattedErrors,
          inputValue: value,
        },
      );

      throw new BadRequestException({
        message: 'Validation failed',
        errors: formattedErrors,
      });
    }

    return object;
  }

  private toValidate(metatype: any): boolean {
    const types = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private formatErrors(errors: any[]): any[] {
    return errors.map((error) => {
      const constraints = error.constraints || {};
      const children = error.children || [];

      const formattedError: any = {
        property: error.property,
        value: error.value,
        constraints: Object.values(constraints),
      };

      if (children.length > 0) {
        formattedError.children = this.formatErrors(children);
      }

      return formattedError;
    });
  }
}
