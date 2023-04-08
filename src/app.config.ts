import * as dotenv from 'dotenv';
dotenv.config();

export const AppSettings = {
  port: process.env.PORT || '3009',
  jwtSecret: process.env.JWT_SECRET || 'mysecretkey1559987',
  allowedMethods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key',
    models: ['text-davinci-003', 'gpt-3.5-turbo', 'gpt-4'],
    endpoints: {
      textCompletion: 'https://api.openai.com/v1/completions',
      chatCompletion: 'https://api.openai.com/v1/chat/completions',
      imageGeneration: 'https://api.openai.com/v1/images/generations',
      audioTranscriptions: 'https://api.openai.com/v1/audio/transcriptions',
      moderation: 'https://api.openai.com/v1/moderations',
    },
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id',
    clientSecret:
      process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret',
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID || 'your-facebook-client-id',
    clientSecret:
      process.env.FACEBOOK_CLIENT_SECRET || 'your-facebook-client-secret',
  },
  db: {
    password: process.env.MYSQL_PASS,
  },
  zapierKey: process.env.ZAPIER_KEY,
};

export const allowedOrigins = ['http://localhost:3000'];
