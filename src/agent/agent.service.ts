import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';
import { AppSettings } from '../app.config.js';
import { PrismaService } from '../prisma.service.js';

import { createWriteStream, createReadStream, unlinkSync } from 'fs';
import moment from 'moment';
import { OpenAI, PromptTemplate, LLMChain } from 'langchain';

import { DataSource } from 'typeorm';
import { SqlDatabase } from 'langchain/sql_db';
import {
  AnalyzeDocumentChain,
  ConversationChain,
  loadQAMapReduceChain,
  loadSummarizationChain,
  SqlDatabaseChain,
  VectorDBQAChain,
} from 'langchain/chains';
import {
  ConsoleCallbackHandler,
  LangChainTracer,
  CallbackManager,
} from 'langchain/callbacks';
import {
  createSqlAgent,
  createVectorStoreAgent,
  initializeAgentExecutor,
  SqlToolkit,
  VectorStoreInfo,
  VectorStoreToolkit,
  ZapierToolKit,
} from 'langchain/agents';
import {
  Calculator,
  ChainTool,
  DynamicTool,
  SerpAPI,
  Tool,
} from 'langchain/tools';
import { ZapierNLAWrapper } from 'langchain/tools';
import { loadPrompt } from 'langchain/prompts';
import { UnstructuredLoader } from 'langchain/document_loaders';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings';
import fs from 'fs';
import { HNSWLib } from 'langchain/vectorstores';
import { ChatMessageHistory, BufferMemory } from 'langchain/memory';
import { HumanChatMessage, AIChatMessage } from 'langchain/schema';
import { exec } from 'child_process';
@Injectable()
export class AgentService {
  constructor(private prisma: PrismaService) {}

  getLangchain(): string {
    return 'langchain';
  }

  // function to allow agent to execute gpt-3 queries
  async askGPT(body): Promise<any> {
    const callbackManager = new CallbackManager();
    callbackManager.addHandler(new ConsoleCallbackHandler());
    callbackManager.addHandler(new LangChainTracer());

    const input = body.prompt;
    console.log(`Executing: ${input}`);

    const model = new OpenAI({
      temperature: body.temperature || 0.8,
      maxTokens: 1227,
      modelName: 'gpt-3.5-turbo',
      // maxConcurrency: 3,
      callbackManager: callbackManager,
    });

    const promptTemplate = new PromptTemplate({
      template: '{input}',
      inputVariables: ['input'],
    });

    const chain = new LLMChain({
      llm: model,
      prompt: promptTemplate,
    });

    const res = await chain.run(input);
    console.log(`Result: ${res}`);
    return res;
  }

  // function to write data to a file
  async writeToFile(body): Promise<string> {
    let data = '';
    let fileName = '';
    // remove \n from body.input
    body.input = body.input.replace(/\\n/g, '');

    try {
      if (typeof body.input === 'string') {
        JSON.parse(body.input);
        data = JSON.parse(body.input).data;
        fileName = JSON.parse(body.input).fileName;
      }
    } catch (error) {
      console.log('Could not parse body', body);
      if (typeof body === 'object') {
        data = body.input.data;
        fileName = body.input.fileName;
      }
    }
    console.log('Writing to file', data, fileName);

    // const filePath = body.filePath;

    const path = `/var/www/html/gpt-business-manager/ai-generated/${fileName}`;

    try {
      console.log('trying to write', data, path);
      const buffer = Buffer.alloc(data.length, data, 'utf8');
      console.log('buffer', buffer);
      console.log('write', fs.writeFileSync(path, buffer));
      // console.log('wrote', write);
      return `Write successful (Saved at ${path}).`;
    } catch (error) {
      return 'Write failed.';
    }
  }

  async readFile(body): Promise<string> {
    const path = `/var/www/html/gpt-business-manager/ai-generated/${body.fileName}`;
    try {
      const readFile = fs.readFileSync(path, 'utf8');
      console.log('read', readFile);
      return readFile;
    } catch (error) {
      return 'Read failed.';
    }
  }

  // function to allow agent to execute terminal commands
  async executeTerminalCommand(body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      exec(body.command, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          reject(error);
          return;
        }
        if (stderr) {
          console.log(`stderr: ${stderr}`);
          reject(stderr);
          return;
        }
        console.log(`stdout: ${stdout}`);
        resolve(stdout);
      });
    });
  }

  async chatAgent(body: any, req: any): Promise<string> {
    // const callbackManager = new CallbackManager();
    // callbackManager.addHandler(new ConsoleCallbackHandler());
    // callbackManager.addHandler(new LangChainTracer());

    const model = new OpenAI({
      temperature: body.temperature || 0.7,
      maxTokens: 1227,
      modelName: 'gpt-3.5-turbo',
      // maxConcurrency: 3,
      // callbackManager: callbackManager,
    });
    const tools = [
      new DynamicTool({
        name: 'DATABASE',
        description:
          'Only call this to execute sql queries, creating projects, tasks, users, decisions, etc. input is a string',
        func: async (input: any) =>
          await this.executeSqlQuery({ query: input }),
      }),
      new DynamicTool({
        name: 'TERMINAL',
        description:
          'Only call this if the user asks to execute terminal commands, input is a string.',
        func: async (input: any) =>
          await this.executeTerminalCommand({ command: input }),
      }),
      new DynamicTool({
        name: 'WRITING_FILES',
        description:
          'Only call this if the user asks to create new file or script, input is a JSON object with "data" and "fileName" properties, data is string with the contents of the file and fileName is Only the name of the file, do not add path or slashes.',
        func: async (input: any) => {
          console.log('will write to file', input);
          return await this.writeToFile({ input });
        },
      }),
      new DynamicTool({
        name: 'ZAPIER',
        description:
          'Only call this to execute the following actions: draft/send emails, creating tweets, creating/updating wordpress posts, hugging face, and managing calendar. input is a string',
        func: async (input: any) => await this.zapierNLA({ prompt: input }),
      }),
      new DynamicTool({
        name: 'QA_OVER_CODE',
        description:
          'Only call this to execute QA over current code base, you can use it to read files and understand types. input is an object with "prompt" and "path" properties. Do not add file name in path property.',
        func: async (input: any) => await this.qaOverCode(input),
      }),

      // new DynamicTool({
      //   name: 'CONVERSATION',
      //   description:
      //     'if you are not sure what to call forward user input to this call. input is a string',
      //   func: async (input: any) =>
      //     await this.conversation({ prompt: body.prompt }),
      // }),
    ];
    const executor = await initializeAgentExecutor(
      tools,
      model,
      'zero-shot-react-description',
    );
    // console.log('executor', executor);
    const chatMemory = await this.prisma.chatMemory.findMany({
      where: {
        userId: 1,
      },
    });

    // if (chatMemory.length > 0) {
    //   const past_messages = [];
    //   for (const message of chatMemory) {
    //     if (message.human) {
    //       past_messages.push(new HumanChatMessage(message.human));
    //     }
    //     if (message.ai) {
    //       past_messages.push(new AIChatMessage(message.ai));
    //     }
    //   }

    //   console.log('past_messages', past_messages);
    //   const memory = new BufferMemory({
    //     chatHistory: new ChatMessageHistory(past_messages),
    //   });
    //   executor.memory = memory;
    // }
    //   const memory = new BufferMemory({
    //     returnMessages: true,
    //     memoryKey: 'chat_history',
    //     inputKey: 'input',
    //   });
    //   executor.memory = memory;
    // }

    const result = await executor.call({ input: body.prompt });
    console.log('result', result);
    // save chat memory
    const chatMemoryInput = {
      data: {
        userId: 1,
        human: body.prompt,
        ai: result.output,
      },
    };
    const chatMemoryRes = await this.prisma.chatMemory.create(chatMemoryInput);
    console.log('chatMemoryRes', chatMemoryRes);

    console.log(`Got output ${result.output}`);
    return result.output;
  }

  // function to chat with agent
  async conversation(body: any): Promise<string> {
    // const callbackManager = new CallbackManager();
    // callbackManager.addHandler(new ConsoleCallbackHandler());
    // callbackManager.addHandler(new LangChainTracer());

    // infer user
    // req.user.id = 1;
    const chatMemory = await this.prisma.chatMemory.findMany({
      where: {
        userId: 1,
      },
    });

    const past_messages = [];
    for (const message of chatMemory) {
      if (message.human) {
        past_messages.push(new HumanChatMessage(message.human));
      }
      if (message.ai) {
        past_messages.push(new AIChatMessage(message.ai));
      }
    }

    // console.log('past_messages', past_messages);
    const memory = new BufferMemory({
      chatHistory: new ChatMessageHistory(past_messages),
    });

    console.log('memory', memory);
    const model = new OpenAI({
      temperature: body.temperature || 0.7,
      maxTokens: 1227,
      modelName: 'gpt-3.5-turbo',
      // maxConcurrency: 3,
      // callbackManager: callbackManager,
    });

    const chain = new ConversationChain({ llm: model, memory: memory });
    const res1 = await chain.call({ input: body.prompt });

    // save chat memory
    const chatMemoryInput = {
      data: {
        userId: 1,
        human: body.prompt,
        ai: res1.response,
      },
    };
    const chatMemoryRes = await this.prisma.chatMemory.create(chatMemoryInput);
    console.log('chatMemoryRes', chatMemoryRes);
    console.log('res1', res1.response);
    return res1.response;
  }

  // function to allow agent to execute mysql queries
  async executeSqlQuery(body: any): Promise<string> {
    // const callbackManager = new CallbackManager();
    // callbackManager.addHandler(new ConsoleCallbackHandler());
    // callbackManager.addHandler(new LangChainTracer());
    const db = await SqlDatabase.fromOptionsParams({
      appDataSourceOptions: {
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        database: 'gpt_biz_mgmt',
        username: 'dev',
        password: AppSettings.db.password,
        connectorPackage: 'mysql2',
        // debug: true,
        // trace: true,
      },
    });
    // console.log('db', await db.run('SELECT * FROM User'));
    const chainDB = new SqlDatabaseChain({
      llm: new OpenAI({
        openAIApiKey: AppSettings.openai.apiKey,
        temperature: 0.3,
        // modelName: 'gpt-3.5-turbo',
        maxTokens: 1227,
        // callbackManager: callbackManager,
      }),
      database: db,
      //   memory: memory,
      // inputKey: 'id',
    });

    try {
      // console.log('chainDB', chainDB, body.query);

      const res = await chainDB.run(body.query);
      console.log('res', res);
      return `Executed query: ${res}`;
    } catch (error) {
      return 'Failed to execute query';
    }
  }

  async qaOverCode(body: any): Promise<string> {
    console.log('body', body);
    // remove \n from prompt
    body = body.replace(/\\n/g, '');
    // remove all ` from prompt
    body = body.replace(/`/g, '');
    console.log('cleaned body', body);
    let theBody;
    try {
      JSON.parse(body);
    } catch (error) {
      console.log('qaOverCode JSON error', error);
      return 'Failed to parse JSON';
    }
    theBody = JSON.parse(body);
    const input = theBody.prompt;
    console.log(`qaOverCode Executing: ${input}`);
    console.log(`qaOverCode Executing path: ${theBody.path}`);
    // if path includes . then it is a file, remove from path
    if (theBody.path.includes('.')) {
      theBody.path = theBody.path.substring(0, theBody.path.lastIndexOf('/'));
    }
    console.log(`qaOverCode Executing path: ${theBody.path}`);
    const model = new OpenAI({
      temperature: 0.7,
      maxTokens: 1227,
      modelName: 'gpt-3.5-turbo',
      // maxConcurrency: 3,
      // callbackManager: callbackManager,
    });

    /* Load in the files we want to do question answering over */
    const folderPath = theBody.path
      ? '/var/www/html/gpt-business-manager' + theBody.path
      : '/var/www/html/gpt-business-manager';
    console.log('folderPath', folderPath);
    const files = fs.readdirSync(folderPath);
    console.log('files', files);
    const texts = files.map((file) =>
      fs.readFileSync(`${folderPath}/${file}`, 'utf8'),
    );
    /* Split the text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    /* Create the documents */
    const docs = await textSplitter.createDocuments(texts);

    /* Create the vector store */
    const vectorStore = await HNSWLib.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
    );
    const vectorStoreInfo: VectorStoreInfo = {
      name: 'current_code_base',
      description:
        'Documents containing the current code base of the business manager',
      vectorStore,
    };

    const toolkit = new VectorStoreToolkit(vectorStoreInfo, model);
    const agent = createVectorStoreAgent(model, toolkit);
    const res = await agent.call({ input: input });
    return res.output;
  }

  // function to allow agent to talk to Zapier NLA
  async zapierNLA(body: any): Promise<string> {
    const input = body.prompt;
    console.log('zapierNLA input', input);
    const callbackManager = new CallbackManager();
    callbackManager.addHandler(new ConsoleCallbackHandler());
    callbackManager.addHandler(new LangChainTracer());

    const model = new OpenAI({
      openAIApiKey: AppSettings.openai.apiKey,
      temperature: 0,
      // modelName: 'gpt-3.5-turbo',
    });

    const promptTemplate = new PromptTemplate({
      template: '{input}',
      inputVariables: ['input'],
    });

    try {
      const zapier = new ZapierNLAWrapper(AppSettings.zapierKey);
      const zapierToolKit = await ZapierToolKit.fromZapierNLAWrapper(zapier);
      const executorZ = await initializeAgentExecutor(
        zapierToolKit.tools,
        model,
        'zero-shot-react-description',
        true,
      );
      const res4 = await executorZ.call({ input });
      console.log('res4', res4);
      return `Tweeted successfully: ${input}`;
    } catch (error) {
      return 'Failed to create the tweet.';
    }
  }

  async langChainTest(body, req): Promise<any> {
    const callbackManager = new CallbackManager();
    callbackManager.addHandler(new ConsoleCallbackHandler());
    callbackManager.addHandler(new LangChainTracer());

    const input = body.prompt;
    console.log(`Executing: ${input}`);

    const model = new OpenAI({
      temperature: 0.8,
      maxTokens: 1227,
      // modelName: 'gpt-3.5-turbo',
      // maxConcurrency: 3,
      callbackManager: callbackManager,
    });

    /* Load in the files we want to do question answering over */
    const folderPath = '/var/www/html/mochef/apoena-api/dataset';
    const files = fs.readdirSync(folderPath);
    const texts = files.map((file) =>
      fs.readFileSync(`${folderPath}/${file}`, 'utf8'),
    );
    /* Split the text into chunks */
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    /* Create the documents */
    const docs = await textSplitter.createDocuments(texts);

    /* Create the vector store */
    const vectorStore = await HNSWLib.fromDocuments(
      docs,
      new OpenAIEmbeddings(),
    );
    // const promptTemplate = new PromptTemplate({
    //   template: 'Em português.',
    //   inputVariables: [input],
    // });
    // const combineDocsChain = loadSummarizationChain(model, {
    //   prompt: promptTemplate,
    // });
    // const text = fs.readFileSync(
    //   '/var/www/html/mochef/apoena-api/dataset/example-doc.txt',
    //   'utf8',
    // );

    const chain = VectorDBQAChain.fromLLM(model, vectorStore);
    // const chainAnalyze = new AnalyzeDocumentChain({
    //   combineDocumentsChain: combineDocsChain,
    // });
    // const chain2 = loadSummarizationChain(model);
    // const chainReduce = loadQAMapReduceChain(model);
    // const chainReduceResponse = await chainReduce.call({
    //   input_documents: docs,
    //   question: input,
    // });
    // const res = await chainAnalyze.call({
    //   input_document: text,
    // });
    // return res;
    // return chainReduceResponse;
    // const serpapiTool = new SerpAPI(
    //   'ab9d25991014fa130ab20293ebf813e1b1a52675474e3a20c78c5fb7e0f0a66d',
    // );
    const qaTool = new ChainTool({
      name: 'legislacao_brasileira',
      description:
        'Base de dados aberta de mais de 200 mil decretos da legislacao brasileira.',
      returnDirect: true,
      chain: chain,
    });
    const tools = [qaTool, new Calculator()];

    /* Create the agent */
    // const vectorStoreInfo: VectorStoreInfo = {
    //   name: 'legislacao_brasileira',
    //   description:
    //     'Base de dados aberta de mais de 200 mil decretos da legislacao brasileira.',
    //   vectorStore,
    // };

    // const toolkit = new VectorStoreToolkit(vectorStoreInfo, model);
    // const agent = createVectorStoreAgent(model, toolkit);
    // // const result = await agent.call({ input });

    const executor = await initializeAgentExecutor(
      tools,
      model,
      'zero-shot-react-description',
    );
    const executorRes = await executor.call({ input: input });
    console.log(`Got output ${executorRes.output}`);
    console.log(
      `Got intermediate steps ${JSON.stringify(
        executorRes.intermediateSteps,
        null,
        2,
      )}`,
    );
    return {
      executorRes: executorRes,
      // chainAnalyze: chainAnalyze,
    };
  }

  async langChainTest2(body, req): Promise<any> {
    const loader = new UnstructuredLoader(
      'http://localhost:8000/general/v0.0.8/general',
      '/var/www/html/mochef/apoena-api/example-doc.html',
    );
    const docs = await loader.load();
    console.log({ docs });

    const callbackManager = new CallbackManager();
    callbackManager.addHandler(new ConsoleCallbackHandler());
    callbackManager.addHandler(new LangChainTracer());
    // console.log('prompt: ', body.prompt);
    // const db = await SqlDatabase.fromOptionsParams({
    //   appDataSourceOptions: {
    //     type: 'mysql',
    //     host: '127.0.0.1',
    //     port: 3306,
    //     database: 'mochef',
    //     username: 'dev',
    //     password: AppSettings.db.password,
    //     connectorPackage: 'mysql2',

    //     // debug: true,
    //     // trace: true,
    //   },
    // });
    // console.log('db', await db.run('SELECT * FROM Recipe'));
    // const chainDB = new SqlDatabaseChain({
    //   llm: new OpenAI({
    //     openAIApiKey: AppSettings.openai.apiKey,
    //     temperature: 0.0,
    //     modelName: 'gpt-3.5-turbo',
    //     callbackManager: callbackManager,
    //   }),
    //   database: db,
    //   // inputKey: 'id',
    // });
    // console.log('chainDB', chainDB);
    // const { OpenAI } = await import('langchain');
    // const sqlToolKit = new SqlToolkit(db);

    // const model = new OpenAI({
    //   openAIApiKey: AppSettings.openai.apiKey,
    //   temperature: 0.7,
    //   modelName: 'gpt-3.5-turbo',
    // });
    // const zapier = new ZapierNLAWrapper(AppSettings.zapierKey);
    // const zapierToolKit = await ZapierToolKit.fromZapierNLAWrapper(zapier);
    // const executorZ = await initializeAgentExecutor(
    //   zapierToolKit.tools,
    //   model,
    //   'zero-shot-react-description',
    //   true,
    // );
    // console.log('Loaded agent.');
    // const input = `Create a draft email about current state of ai to aluska212@gmail.com. `;
    // const res4 = await executorZ.call({ input });
    // console.log('res4', res4);
    // const template =
    //   'What would be a good company name a company that makes {product}?';
    // const prompt = new PromptTemplate({
    //   template: template,
    //   inputVariables: ['product'],
    // });
    // const chain = new LLMChain({
    //   llm: model,
    //   prompt: prompt,
    // });

    // const executor = createSqlAgent(model, sqlToolKit);
    // const res = await chainDB.run(body.product);
    // const res2 = await chain.run(body.product);
    // const res3 = await executor.call({ input: body.product });

    console.log('res', docs);
    return docs;
  }
}
