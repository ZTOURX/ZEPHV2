import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// 📝 PALITAN MO ITO kung may partikular na API URL na binigay ang provider mo
const BASE_URL = 'https://openrouter.ai/api/v1'; 

const SIM_CONFIG_COLLECTION = 'sim_config';
const SIM_MODEL_COLLECTION = 'sim_model';

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '3.5.0',
  author: 'You',
  role: Role.ANYONE,
  description: 'Savage Simsimi chat powered by Multi-Model API Provider.',
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
  const threadId = (chat as any).threadID || (chat as any).chatID || (chat as any).id || 'default_thread';

  if (!input) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💡 **Simsimi Multi-AI Guide:**\n• `sim <iyong tanong>` - Kausapin si Sim\n• `sim model <deepseek | gpt3 | gpt4 | gpt5 | embedding>` - Palitan ang utak ng AI\n• `sim on` - I-on ang auto-reply\n• `sim off` - Patayin ang auto-reply',
    });
    return;
  }

  if (!(await db.bot.isCollectionExist(SIM_CONFIG_COLLECTION))) {
    await db.bot.createCollection(SIM_CONFIG_COLLECTION);
  }
  if (!(await db.bot.isCollectionExist(SIM_MODEL_COLLECTION))) {
    await db.bot.createCollection(SIM_MODEL_COLLECTION);
  }

  const configColl = await db.bot.getCollection(SIM_CONFIG_COLLECTION);
  const modelColl = await db.bot.getCollection(SIM_MODEL_COLLECTION);

  const savedModel = await modelColl.get(threadId);
  let currentModel = typeof savedModel === 'string' ? savedModel : 'deepseek';

  if (input.toLowerCase() === 'on') {
    await configColl.set(threadId, 'true');
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🤖 **Sim Auto-Reply is now ON!** Engine: **${currentModel.toUpperCase()}**. Humanda kayo sa bardagulan. 💅`,
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
      message: `🔄 **Model switched!** Simsimi is now using **${targetModel.toUpperCase()}** engine. 🚀`,
    });
    return;
  }

  try {
    const apiKey = process.env.PROVIDER_API_KEY || '';
    if (!apiKey) {
      throw new Error('Missing PROVIDER_API_KEY in Render settings.');
    }

    const systemPrompt = `You are Simsimi, a chaotic, funny, sarcastic, and slightly savage AI chatbot. 
    You speak fluently in conversational Taglish/Filipino street slang (use terms like "bhie", "charot", "accla", "luh", "eyy", "g", "ssob", "kairita"). 
    Keep your responses extremely short (1 to 2 sentences maximum). 
    Be brutally honest, witty, and playfully rude or roast the user if they insult you. Never sound like a formal, polite, or helpful AI assistant.`;

    // Pagpili ng tamang Model ID base sa text na hiningi ng provider mo
    let modelId = 'deepseek/deepseek-chat'; // default
    let isEmbedding = false;

    if (currentModel === 'deepseek') modelId = 'deepseek/deepseek-chat';
    if (currentModel === 'gpt3') modelId = 'openai/gpt-3.5-turbo';
    if (currentModel === 'gpt4') modelId = 'openai/gpt-4o';
    if (currentModel === 'gpt5') modelId = 'openai/gpt-5'; // palitan ng eksaktong gpt-5 model name ng provider mo kung meron na
    if (currentModel === 'embedding') {
      modelId = 'openai/text-embedding-3-small';
      isEmbedding = true;
    }

    let endpoint = `${BASE_URL}/chat/completions`;
    let requestBody: any = {
      model: modelId,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: input }],
      max_tokens: 70,
      temperature: 0.85,
    };

    // Kung embedding ang pinili
    if (isEmbedding) {
      endpoint = `${BASE_URL}/embeddings`;
      requestBody = {
        model: modelId,
        input: input,
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Provider API responded with status ${response.status}`);
    }

    const data = await response.json() as any;
    let simResponse = '';

    if (isEmbedding) {
      const vector = data.data?.[0]?.embedding;
      simResponse = `🧬 **Embedding Vector Matrix:** [${vector?.slice(0, 3).join(', ')}... total ${vector?.length} dimensions]`;
    } else {
      simResponse = data.choices?.[0]?.message?.content || 'Inantok ako bigla accla, ulitin mo nga.';
    }

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: simResponse,
    });

  } catch (error) {
    console.error('Multi-Model API Error:', error);
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `❌ **Luh, sumakit ang ulo ko.** Pakisiguro na tama ang \`PROVIDER_API_KEY\` mo sa Render settings at may credits ka pa, ssob! 🙄`,
    });
  }
};
