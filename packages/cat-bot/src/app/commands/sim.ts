import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

const SIM_CONFIG_COLLECTION = 'sim_config';
const SIM_MODEL_COLLECTION = 'sim_model';

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '3.0.0',
  author: 'You',
  role: Role.ANYONE,
  description: 'Savage Simsimi chat powered by multiple AI engines. Usage: sim <msg> | sim model <name> | sim on | sim off',
  category: 'AI',
  hasPrefix: true,
  cooldown: 2,
  options: [
    {
      type: OptionType.string,
      name: 'text',
      description: 'Your question or command toggle',
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
      message: '💡 **Simsimi Multi-AI Guide:**\n• `sim <iyong tanong>` - Kausapin si Sim\n• `sim model <deepseek | gpt3 | gpt4 | gpt5>` - Palitan ang utak ng AI\n• `sim on` - I-on ang auto-reply\n• `sim off` - Patayin ang auto-reply',
    });
    return;
  }

  // Database collections initialization
  if (!(await db.bot.isCollectionExist(SIM_CONFIG_COLLECTION))) {
    await db.bot.createCollection(SIM_CONFIG_COLLECTION);
  }
  if (!(await db.bot.isCollectionExist(SIM_MODEL_COLLECTION))) {
    await db.bot.createCollection(SIM_MODEL_COLLECTION);
  }

  const configColl = await db.bot.getCollection(SIM_CONFIG_COLLECTION);
  const modelColl = await db.bot.getCollection(SIM_MODEL_COLLECTION);

  // Kuhanin ang kasalukuyang model ng GC na ito (Default: deepseek)
  let currentModel = (await modelColl.get(threadId)) || 'deepseek';

  // ==================== [ SWITCH ON / OFF ] ====================
  if (input.toLowerCase() === 'on') {
    await configColl.set(threadId, 'true');
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🤖 **Sim Auto-Reply is now ON!** Kasalukuyang gamit: **${currentModel.toUpperCase()}**. Humanda kayo sa bardagulan. 💅`,
    });
    return;
  }

  if (input.toLowerCase() === 'off') {
    await configColl.set(threadId, 'false');
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💤 **Sim Auto-Reply is now OFF.** Tatahimik na ako, paps.',
    });
    return;
  }

  // ==================== [ CHANGE MODEL COMMAND ] ====================
  if (args[0]?.toLowerCase() === 'model' && args[1]) {
    const targetModel = args[1].toLowerCase();
    const validModels = ['deepseek', 'gpt3', 'gpt4', 'gpt5', 'embedding'];

    if (!validModels.includes(targetModel)) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ **Invalid model, ssob!** Pumili lang sa: `deepseek`, `gpt3`, `gpt4`, `gpt5`, o `embedding`.',
      });
      return;
    }

    await modelColl.set(threadId, targetModel);
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🔄 **Model switched successfully!** Simsimi is now using **${targetModel.toUpperCase()}** engine. 🚀`,
    });
    return;
  }

  // ==================== [ AI ROUTING CORE ] ====================
  try {
    let apiUrl = '';
    let apiKey = '';
    let requestBody: any = {};

    const systemPrompt = `You are Simsimi, a chaotic, funny, sarcastic, and slightly savage AI chatbot. 
    You speak fluently in conversational Taglish/Filipino street slang (use terms like "bhie", "charot", "accla", "luh", "eyy", "g", "ssob", "kairita"). 
    Keep your responses extremely short (1 to 2 sentences maximum). 
    Be brutally honest, witty, and playfully rude or roast the user if they insult you. Never sound like a formal, polite, or helpful AI assistant.`;

    // Pagpili ng tamang API Credential base sa kung anong model ang active sa GC niyo
    if (currentModel === 'deepseek') {
      apiUrl = 'https://api.deepseek.com/chat/completions';
      apiKey = process.env.DEEPSEEK_API_KEY || '';
      requestBody = {
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: input }],
        max_tokens: 70,
        temperature: 0.85,
      };
    } else if (currentModel === 'embedding') {
      // Standard text embedding structure (OpenAI based format)
      apiUrl = 'https://api.openai.com/v1/embeddings';
      apiKey = process.env.OPENAI_API_KEY || '';
      requestBody = {
        model: 'text-embedding-3-small',
        input: input,
      };
    } else {
      // Para sa GPT-3.5-Turbo, GPT-4o series, at GPT-5 series
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      apiKey = process.env.OPENAI_API_KEY || '';
      
      let openAIModel = 'gpt-3.5-turbo';
      if (currentModel === 'gpt4') openAIModel = 'gpt-4o';
      if (currentModel === 'gpt5') openAIModel = 'gpt-5'; // O pinakabagong gpt-5 alias model

      requestBody = {
        model: openAIModel,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: input }],
        max_tokens: 70,
        temperature: 0.85,
      };
    }

    if (!apiKey) {
      throw new Error(`Missing API Key for model: ${currentModel}`);
    }

    // Native Fetch Request para all-goods sa Render nang walang ini-install
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`API Endpoint responded with status ${response.status}`);
    }

    const data = await response.json() as any;
    let simResponse = '';

    // Iba ang response parser ng embedding kumpara sa chat completion
    if (currentModel === 'embedding') {
      const vector = data.data?.[0]?.embedding;
      simResponse = `🧬 **Embedding Vector Matrix Generated:** [${vector?.slice(0, 3).join(', ')}... total ${vector?.length} dimensions]`;
    } else {
      simResponse = data.choices?.[0]?.message?.content || 'Inantok ako bigla accla, ulitin mo nga.';
    }

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: simResponse,
    });

  } catch (error) {
    console.error('Sim Multi-AI Command Error:', error);
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `❌ **Luh, sumakit ang ulo ko.** Pakisiguro na may load/credits ka pa at tama ang mga Keys mo sa Render Environment settings, ssob! 🙄`,
    });
  }
};
