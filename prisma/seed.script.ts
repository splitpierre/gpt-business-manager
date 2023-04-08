import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const LANG = 'en';

// if (require.main === module) {
//   seed().catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
// }
seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
async function seed() {
  console.info('Seeding database...');

  const client = new PrismaClient();

  /**
   * CONFIG VARIABLE TO AVOID RUNNING THE IMPORT OF SOME TABLES
   * Accepted values in array
   * ['all']
   * ['users', 'user-roles',]
   */
  const SKIP_IMPORT = [
    // 'cache-policies',
    // 'users',
    // 'user-roles',
    // 'prompts',
    // 'ingredients',
    // 'recipes',
    // 'meal-types',
    // 'agents',
    // 'agent-categories',
    // 'account-tiers',
  ];

  /**
   * Prompts
   * */
  // const prompts = LANG === 'en' ? englishPrompts : portuguesePrompts;
  // for (const prompt of englishPrompts) {
  //   if (SKIP_IMPORT.includes('prompts')) break;
  //   const ptCorrespondent = portuguesePrompts.find(
  //     (ptPrompt) => ptPrompt.name === prompt.name,
  //   );
  //   const inserted = await client.prompt.upsert({
  //     where: { name: prompt.name },
  //     update: {},
  //     create: {
  //       name: prompt.name,
  //       text: prompt.prompt,
  //       textPt: ptCorrespondent?.prompt,
  //     },
  //   });
  //   console.log('add prompt', inserted);
  // }
  // console.info('prompts seed finished.');

  void client.$disconnect();

  // console.info('Seeding database with custom seed...');
  // customSeed();

  console.info('Seeded database successfully');
}
