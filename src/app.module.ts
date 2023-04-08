import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AgentModule } from './agent/agent.module.js';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [ScheduleModule.forRoot(), AgentModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
