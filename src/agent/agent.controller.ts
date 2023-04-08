import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { AgentService } from './agent.service.js';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('langchain')
  getLangchain(): string {
    return this.agentService.getLangchain();
  }

  @Post('execute-sql')
  executeSqlQuery(@Body() body: any) {
    return this.agentService.executeSqlQuery(body);
  }

  @Post('execute-terminal')
  executeTerminalCommand(@Body() body: any) {
    return this.agentService.executeTerminalCommand(body);
  }

  @Post('gpt')
  askGPT(@Body() body: any) {
    return this.agentService.askGPT(body);
  }

  @Post('zapier')
  zapierNLA(@Body() body: any) {
    return this.agentService.zapierNLA(body);
  }

  @Post('write')
  writeToFile(@Body() body: any) {
    return this.agentService.writeToFile(body);
  }

  @Post('chat')
  chatAgent(@Body() body: any, @Request() req: any) {
    return this.agentService.chatAgent(body, req);
  }
}
