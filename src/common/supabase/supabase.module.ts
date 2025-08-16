import { Module } from '@nestjs/common';

import { SupabaseService } from './supabase.service';

/**
 * Module for Supabase integration
 */
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
