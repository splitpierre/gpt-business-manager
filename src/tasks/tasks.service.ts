import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { PrismaService } from '../prisma.service.js';
@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  // every day
  @Cron('0 0 0 * * *')
  async checkRequestLimit() {}
}
