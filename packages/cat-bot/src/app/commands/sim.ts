import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

const BASE_URL = 'https://api.chatanywhere.tech/v1'; 
const SIM_CONFIG_COLLECTION = 'sim_config';
const SIM_MODEL_COLLECTION = 'sim_model';

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '4.1.0',
  author: 'Zephyrus Wym',
  role: Role.ANYONE,
  description: 'Chaotic multi-AI chatbot that automatically roasts or replies to messages when toggled ON.',
  category: 'AI',
  hasPrefix: true,
  cooldown: 2,
  options: [
    {
      type: OptionType.string,
      name: 'text',
      description: 'The question for Simsimi or toggle command (on/off/model <name>)',
      required: true,
    },
  ],
};

// =========================================================================
// 🧠 REUSABLE AI CALL FUNCTION
// =========================================================================
const callChatAnywhereAI = async (input: string, currentModel: string): Promise<string> => {
  const apiKey = process.env.PROVIDER_API_KEY || '';
  if (!apiKey) throw new Error('Missing PROVIDER_API_KEY');

  const systemPrompt = `You are Simsimi, a chaotic, funny, sarcastic, and slightly savage AI chatbot. 
  You speak fluently in conversational Taglish/Filipino street slang (use terms like "bhie", "charot", "accla", "luh", "eyy", "g", "ssob", "kairita"). 
  Keep your responses extremely short (1 to 2 sentences maximum). 
  Be brutally honest, witty, and playfully rude or roast the user if they insult you. Never sound like a formal, polite, or helpful AI assistant.`;

  let modelId = 'deepseek-chat'; 
  let isEmbedding = false;

  if (currentModel === 'deepseek') modelId = 'deepseek-chat';
  if (currentModel === 'gpt3') modelId = 'gpt-3.5-turbo';
  if (currentModel === 'gpt4') modelId = 'gpt-4o-mini';
  if (currentModel === 'gpt5') modelId = 'gpt-4o';
  if (currentModel === 'embedding') {
    modelId = 'text-embedding-3-small';
    isEmbedding = true;
  }

  let endpoint = `${BASE_URL}/chat/completions`;
  let requestBody: any = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: input }],
    max_tokens: 80,
    temperature: 0.8,
  };

  if (isEmbedding) {
    endpoint = `${BASE_URL}/embeddings`;
    requestBody = { model: modelId, input };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  const data = await response.json() as any;

  if (isEmbedding) {
    const vector = data.data?.[0]?.embedding;
    return `🧬 **Embedding Vector Matrix:** [${vector?.slice(0, 3).join(', ')}...]`;
  }
  
  return data.choices?.[0]?.message?.content || 'Inantok ako bigla accla, ulitin mo nga.';
};

// =========================================================================
// 🛠️ COMMAND HANDLER
// =========================================================================
export const onCommand = async ({ chat, args, db }: AppCtx): Promise<void> => {
  const input = args.join(' ').trim();
  const threadId = (chat as any).threadID || (chat as any).chatID || (chat as any).id || 'default_thread';

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

  if (!input) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💡 **Simsimi Multi-AI Guide:**\n• `sim <iyong tanong>` - Kausapin si Sim\n• `sim model <deepseek | gpt3 | gpt4>` - Palitan ang AI\n• `sim on` - I-on ang automatic auto-reply nang walang prefix\n• `sim off` - Patayin ang auto-reply',
    });
    return;
  }

  // ⚡ TOGGLE ON (Eto na yung custom prompt mo, ssob!)
  if (input.toLowerCase() === 'on') {
    await configColl.set(threadId, 'true');
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '𝗦𝗶𝗺 𝗔𝘂𝘁𝗼-𝗥𝗲𝗽𝗹𝘆 𝗶𝘀 𝗻𝗼𝘄 𝗢𝗡! Develop by: Zephyrus Wym. Ready na makipag-talastasan 🖕',
    });
    return;
  }

  // TOGGLE OFF
  if (input.toLowerCase() === 'off') {
    await configColl.set(threadId, 'false');
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💤 **Sim Auto-Reply is now OFF.** Tatahimik na ako, paps. Gagamitin niyo na lang ako via `sim <tanong>`.',
    });
    return;
  }

  // MODEL CHANGE
  if (args[0]?.toLowerCase() === 'model' && args[1]) {
    const targetModel = args[1].toLowerCase();
    const validModels = ['deepseek', 'gpt3', 'gpt4', 'gpt5', 'embedding'];

    if (!validModels.includes(targetModel)) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ **Invalid model!** Pumili lang sa: `deepseek`, `gpt3`, `gpt4`.',
      });
      return;
    }

    await modelColl.set(threadId, targetModel);
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🔄 **Model switched!** Gagamitin ko na ang **${targetModel.toUpperCase()}**.`,
    });
    return;
  }

  // MANUAL TALK
  try {
    const responseText = await callChatAnywhereAI(input, currentModel);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: responseText });
  } catch (error) {
    console.error('Sim Manual Chat Error:', error);
  }
};

// =========================================================================
// 📡 AUTO-REPLY LISTEN ENGINE
// =========================================================================
export const onMessage = async ({ chat, message, db }: AppCtx & { message: any }): Promise<void> => {
  const body = message?.body?.trim() || '';
  if (!body) return;

  if (body.toLowerCase().startsWith('sim') || body.startsWith('/') || body.startsWith('!')) {
    return;
  }

  const threadId = (chat as any).threadID || (chat as any).chatID || (chat as any).id || 'default_thread';

  try {
    if (!(await db.bot.isCollectionExist(SIM_CONFIG_COLLECTION))) return;
    
    const configColl = await db.bot.getCollection(SIM_CONFIG_COLLECTION);
    const isAutoReplyOn = await configColl.get(threadId);

    if (isAutoReplyOn === 'true') {
      const modelColl = await db.bot.getCollection(SIM_MODEL_COLLECTION);
      const savedModel = await modelColl.get(threadId);
      let currentModel = typeof savedModel === 'string' ? savedModel : 'deepseek';

      const aiReply = await callChatAnywhereAI(body, currentModel);

      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: aiReply,
      });
    }
  } catch (error) {
    console.error('Sim Auto-Reply Listener Error:', error);
  }
};
