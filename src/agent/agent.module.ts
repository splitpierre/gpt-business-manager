import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';

@Module({
  imports: [],
  controllers: [AgentController],
  providers: [PrismaService, AgentService],
})
export class AgentModule {}
