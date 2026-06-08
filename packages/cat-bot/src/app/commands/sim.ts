import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';
import { OpenAI } from 'openai'; // DeepSeek uses OpenAI's compatible SDK structure

// Ininitialize ang client gamit ang base URL ng DeepSeek
// Awtomatikong babasahin ang DEEPSEEK_API_KEY galing sa Render Environment
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const SIM_CONFIG_COLLECTION = 'sim_config';

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '3.0.0',
  author: 'You',
  role: Role.ANYONE,
  description: 'Savage Simsimi chat powered by DeepSeek. Usage: sim <message> | sim on | sim off',
  category: 'AI',
  hasPrefix: true,
  cooldown: 2, // Proteksyon laban sa mga spammer sa GC niyo
  options: [
    {
      type: OptionType.string,
      name: 'text',
      description: 'Your question to Simsimi, or switch toggle (on/off)',
      required: true,
    },
  ],
};

export const onCommand = async ({ chat, args, db }: AppCtx): Promise<void> => {
  const input = args.join(' ').trim();
  const threadId = chat.threadID || chat.chatID;

  if (!input) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💡 **DeepSeek Simsimi Guide:**\n• `sim <iyong tanong>` - Kausapin si Sim\n• `sim on` - I-on ang auto-reply sa lahat ng chat sa GC\n• `sim off` - Patayin ang auto-reply',
    });
    return;
  }

  // Database initialization para sa auto-reply tracking
  if (!(await db.bot.isCollectionExist(SIM_CONFIG_COLLECTION))) {
    await db.bot.createCollection(SIM_CONFIG_COLLECTION);
  }
  const configColl = await db.bot.getCollection(SIM_CONFIG_COLLECTION);

  // ==================== [ SWITCH ON ] ====================
  if (input.toLowerCase() === 'on') {
    await configColl.set(threadId, 'true');
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '🤖 **Sim Auto-Reply is now ON!** Sasagot na ako sa bawat chats dito sa GC gamit ang DeepSeek utak ko. Humanda kayo sa bardagulan. 💅',
    });
    return;
  }

  // ==================== [ SWITCH OFF ] ====================
  if (input.toLowerCase() === 'off') {
    await configColl.set(threadId, 'false');
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💤 **Sim Auto-Reply is now OFF.** Tatahimik na ako, pero pwede niyo pa rin akong utusan gamit ang `sim <message>` command.',
    });
    return;
  }

  // ==================== [ DEEPSEEK CORE CHAT ] ====================
  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat', // Gagamit ng pinakabagong DeepSeek-V3/R1 model na sobrang mura at talino
      messages: [
        {
          role: 'system',
          content: `You are Simsimi, a chaotic, funny, sarcastic, and slightly savage AI chatbot. 
          You speak fluently in conversational Taglish/Filipino street slang (use terms like "bhie", "charot", "accla", "luh", "eyy", "g", "ssob", "kairita"). 
          Keep your responses extremely short (1 to 2 sentences maximum). 
          Be brutally honest, witty, and playfully rude or roast the user if they insult you. Never sound like a formal, polite, or helpful AI assistant.`
        },
        {
          role: 'user',
          content: input,
        },
      ],
      max_tokens: 70, // Nilimitahan ang haba para iwas katay sa tokens
      temperature: 0.85,
    });

    const simResponse = completion.choices[0].message?.content || 'Inantok ako bigla accla, ulitin mo nga.';

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: simResponse,
    });

  } catch (error) {
    console.error('DeepSeek Command Error:', error);
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '❌ **Luh, sumakit ang ulo ko.** Pakisiguro na nakalagay ang `DEEPSEEK_API_KEY` mo sa Render environment settings, at siguraduhing may active credits ka pa, ssob! 🙄',
    });
  }
};
