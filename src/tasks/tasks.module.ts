import { Module } from '@nestjs/common';

import { PrismaService } from '../prisma.service.js';
import { TasksService } from './tasks.service.js';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [HttpModule],
  providers: [TasksService, PrismaService],
})
export class TasksModule {}
