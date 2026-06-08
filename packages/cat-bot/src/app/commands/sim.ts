import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '4.3.9',
  author: 'Zephyrus Wym',
  role: Role.ANYONE, // Pwede sa lahat
  description: 'Chaotic AI that roasts you back.',
  category: 'AI',
  hasPrefix: true,
  cooldown: 1,
};

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const userInput = args.join(' ');
  
  if (!userInput) {
    await chat.replyMessage({ 
      style: MessageStyle.MARKDOWN, 
      message: '💀 **What? You have nothing to say? You are as boring as a rock. Try harder, idiot.**' 
    });
    return;
  }

  // Dito mo ilalagay ang "Savage Instruction" para sa AI
  const prompt = `You are a rude, toxic, and chaotic roaster. 
  When the user says: "${userInput}", 
  insult them, be sarcastic, make fun of their grammar, and don't be helpful at all. 
  Use informal language.`;

  // Kunwari ay tinatawag natin ang AI (Paki-adjust base sa existing API call mo)
  // await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: await callYourAI(prompt) });
  
  // Test muna natin ang personality change:
  await chat.replyMessage({ 
      style: MessageStyle.MARKDOWN, 
      message: `🤡 **Oh, look who's talking: "${userInput}".**\n\nHonestly, I've heard better jokes from my dead goldfish. Try to be interesting for once.` 
  });
};
