import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

const BASE_URL = 'https://api.chatanywhere.tech/v1';

// 🧠 Pure Memory-Based Toggle Map (Katumbas ng global.simsimi = new Map())
const activeThreads = new Map<string, { isOn: boolean; model: string }>();

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '4.3.7',
  author: 'Zephyrus Wym',
  role: Role.ANYONE,
  description: 'Chaotic multi-AI chatbot that automatically roasts or replies to messages when toggled ON.',
  category: 'AI',
  hasPrefix: true,
  cooldown: 5,
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
// 🌐 CHATANYWHERE API CORE CALL
// =========================================================================
const callChatAnywhereAI = async (input: string, currentModel: string): Promise<string> => {
  const apiKey = process.env.PROVIDER_API_KEY || '';
  if (!apiKey) throw new Error('Missing PROVIDER_API_KEY');

  const systemPrompt = `You are Simsimi, a chaotic, funny, sarcastic, and slightly savage AI chatbot. 
  You speak fluently in conversational Taglish/Filipino street slang (use terms like "bhie", "charot", "accla", "luh", "eyy", "g", "ssob", "kairita"). 
  Keep your responses extremely short (1 to 2 sentences maximum). 
  Be brutally honest, witty, and playfully rude or roast the user if they insult you. Never sound like a formal, polite, or helpful AI assistant.`;

  let modelId = 'deepseek-chat';
  if (currentModel === 'gpt3') modelId = 'gpt-3.5-turbo';
  if (currentModel === 'gpt4') modelId = 'gpt-4o-mini';
  if (currentModel === 'gpt5') modelId = 'gpt-4o';

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: input }],
      max_tokens: 80,
      temperature: 0.8,
    }),
  });

  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || 'Inantok ako bigla accla, ulitin mo nga.';
};

// =========================================================================
// 📡 HANDLE EVENT (Dito nakikinig sa normal na chat nang walang prefix)
// =========================================================================
export const onEvent = async ({ chat, message }: AppCtx & { message: any }): Promise<void> => {
  const body = message?.body?.trim() || '';
  if (!body) return;

  // Iwasan ang loop kapag ang chat ay command ng sim mismo o iba pang bot commands
  if (body.toLowerCase().startsWith('sim') || body.startsWith('/') || body.startsWith('!')) return;

  const threadId = (chat as any).threadID || (chat as any).chatID || (chat as any).id || 'default_thread';
  const threadSettings = activeThreads.get(threadId);

  if (threadSettings && threadSettings.isOn) {
    try {
      const aiReply = await callChatAnywhereAI(body, threadSettings.model);

      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: aiReply,
      });
    } catch (error) {
      console.error('Sim Event API Error:', error);
    }
  }
};

// =========================================================================
// 🛠️ RUN COMMAND (sim on / sim off / sim model <name> / sim <text>)
// =========================================================================
export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const input = args.join(' ').trim();
  const threadId = (chat as any).threadID || (chat as any).chatID || (chat as any).id || 'default_thread';

  if (!activeThreads.has(threadId)) {
    activeThreads.set(threadId, { isOn: false, model: 'deepseek' });
  }
  const currentSettings = activeThreads.get(threadId)!;

  if (!input) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💡 **Simsimi Multi-AI Guide:**\n• `sim <tanong>` - Kausapin si Sim\n• `sim model <deepseek | gpt3 | gpt4>` - Palitan ang AI\n• `sim on` - Buksan ang auto-reply\n• `sim off` - Patayin ang auto-reply',
    });
    return;
  }

  // 🔄 CASE: sim on
  if (input.toLowerCase() === 'on') {
    if (currentSettings.isOn) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Naka-on na ang sim, paps. Huwag mo na ako paulit-ulitin!' });
      return;
    }
    currentSettings.isOn = true;
    activeThreads.set(threadId, currentSettings);
    
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '𝗦𝗶𝗺 𝗔𝘂𝘁ο-𝗥𝗲𝗽𝗹𝘆 𝗶𝘀 𝗻𝗼𝘄 𝗢𝗡! Develop by: Zephyrus Wym. Ready na makipag-talastasan 🖕',
    });
    return;
  }

  // 🔄 CASE: sim off
  if (input.toLowerCase() === 'off') {
    if (!currentSettings.isOn) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Hindi pa naman nakabukas ang sim mo ah?' });
      return;
    }
    currentSettings.isOn = false;
    activeThreads.set(threadId, currentSettings);

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💤 **Sim Auto-Reply is now OFF.** Tatahimik na ako, paps.',
    });
    return;
  }

  // 🔄 CASE: sim model <name>
  if (args[0]?.toLowerCase() === 'model' && args[1]) {
    const targetModel = args[1].toLowerCase();
    if (!['deepseek', 'gpt3', 'gpt4', 'gpt5'].includes(targetModel)) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Invalid model! Pumili lang sa: `deepseek`, `gpt3`, `gpt4`.' });
      return;
    }
    currentSettings.model = targetModel;
    activeThreads.set(threadId, currentSettings);

    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: `🔄 Model switched to **${targetModel.toUpperCase()}**.` });
    return;
  }

  // 🔄 DEFAULT CASE: Manual ask (sim <tanong>)
  try {
    const responseText = await callChatAnywhereAI(input, currentSettings.model);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: responseText });
  } catch (error) {
    console.error('Sim Manual Error:', error);
  }
};

// Aliases para sa listener hooks ng engine mo
export const handleEvent = onEvent;
export const onChat = onEvent;
  if (!activeThreads.has(threadId)) {
    activeThreads.set(threadId, { isOn: false, model: 'deepseek' });
  }
  const currentSettings = activeThreads.get(threadId)!;

  if (!input) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💡 **Simsimi Multi-AI Guide:**\n• `sim <tanong>` - Kausapin si Sim\n• `sim model <deepseek | gpt3 | gpt4>` - Palitan ang AI\n• `sim on` - Buksan ang auto-reply\n• `sim off` - Patayin ang auto-reply',
    });
    return;
  }

  // 🔄 CASE "on"
  if (input.toLowerCase() === 'on') {
    if (currentSettings.isOn) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Naka-on na ang sim, paps. Huwag mo na ako paulit-ulitin!' });
      return;
    }
    currentSettings.isOn = true;
    activeThreads.set(threadId, currentSettings);
    
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '𝗦𝗶𝗺 𝗔𝘂𝘁ο-𝗥𝗲𝗽𝗹𝘆 𝗶𝘀 𝗻𝗼𝘄 𝗢𝗡! Develop by: Zephyrus Wym. Ready na makipag-talastasan 🖕',
    });
    return;
  }

  // 🔄 CASE "off"
  if (input.toLowerCase() === 'off') {
    if (!currentSettings.isOn) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Hindi pa naman nakabukas ang sim mo ah?' });
      return;
    }
    currentSettings.isOn = false;
    activeThreads.set(threadId, currentSettings);

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💤 **Sim Auto-Reply is now OFF.** Tatahimik na ako, paps.',
    });
    return;
  }

  // 🔄 CASE "model"
  if (args[0]?.toLowerCase() === 'model' && args[1]) {
    const targetModel = args[1].toLowerCase();
    if (!['deepseek', 'gpt3', 'gpt4', 'gpt5'].includes(targetModel)) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Invalid model! Pumili lang sa: `deepseek`, `gpt3`, `gpt4`.' });
      return;
    }
    currentSettings.model = targetModel;
    activeThreads.set(threadId, currentSettings);

    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: `🔄 Model switched to **${targetModel.toUpperCase()}**.` });
    return;
  }

  // 🔄 DEFAULT (Manual single query: sim <tanong>)
  try {
    const responseText = await callChatAnywhereAI(input, currentSettings.model);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: responseText });
  } catch (error) {
    console.error('Sim Manual Error:', error);
  }
};

// Fallback exports para sigurado sa frameworks hook
export const handleEvent = onEvent;
export const onChat = onEvent;
      message: '💤 **Sim Auto-Reply is now OFF.** Tatahimik na ako, paps.',
    });
    return;
  }

  // MODEL CHANGE
  if (args[0]?.toLowerCase() === 'model' && args[1]) {
    const targetModel = args[1].toLowerCase();
    if (!['deepseek', 'gpt3', 'gpt4', 'gpt5'].includes(targetModel)) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Invalid model!' });
      return;
    }
    await modelColl.set(threadId, targetModel);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: `🔄 Model switched to **${targetModel.toUpperCase()}**.` });
    return;
  }

  // MANUAL SINGLE TANONG (sim <message>)
  try {
    const responseText = await callChatAnywhereAI(input, currentModel);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: responseText });
  } catch (error) {
    console.error('Sim Error:', error);
  }
};

// =========================================================================
// 🔄 AUTOMATIC REPLY LOOP (Tatakbo LANG kapag naka-sim on)
// =========================================================================
export const onReply = async ({ chat, message, db }: AppCtx & { message: any }): Promise<void> => {
  const body = message?.body?.trim() || '';
  if (!body) return;

  // Iwasan ang loop sa mga utos ng command mismo
  if (body.toLowerCase().startsWith('sim') || body.startsWith('/') || body.startsWith('!')) return;

  const threadId = (chat as any).threadID || (chat as any).chatID || (chat as any).id || 'default_thread';

  try {
    if (!(await db.bot.isCollectionExist(SIM_CONFIG_COLLECTION))) return;
    
    const configColl = await db.bot.getCollection(SIM_CONFIG_COLLECTION);
    const isAutoReplyOn = await configColl.get(threadId);

    // BUMUBUKA LANG ANG BIBIG NI BOT KUNG NAKA 'sim on' ANG DATABASE VALUE
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
    console.error('Sim Auto-Reply Loop Error:', error);
  }
};

// Fallback exports para siguradong masalo ng engine ng Cat-Bot ang reply process
export const onChat = onReply;
export const reply = onReply;
