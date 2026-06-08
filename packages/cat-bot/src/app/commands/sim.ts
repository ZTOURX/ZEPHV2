import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

const BASE_URL = 'https://api.chatanywhere.tech/v1';
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

export const onEvent = async ({ chat, message }: AppCtx & { message: any }): Promise<void> => {
  const body = message?.body?.trim() || '';
  if (!body) return;

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

  if (input.toLowerCase() === 'on') {
    if (currentSettings.isOn) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Naka-on na ang sim, paps.' });
      return;
    }
    currentSettings.isOn = true;
    activeThreads.set(threadId, currentSettings);
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '𝗦𝗶𝗺 𝗔𝘂𝘁ο-𝗥𝗲𝗽𝗹𝘆 𝗶𝘀 𝗻𝗼𝘄 𝗢𝗡! Ready na makipag-talastasan 🖕',
    });
    return;
  }

  if (input.toLowerCase() === 'off') {
    if (!currentSettings.isOn) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Hindi pa nakabukas ang sim mo ah?' });
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

  if (args[0]?.toLowerCase() === 'model' && args[1]) {
    const targetModel = args[1].toLowerCase();
    if (!['deepseek', 'gpt3', 'gpt4', 'gpt5'].includes(targetModel)) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Invalid model!' });
      return;
    }
    currentSettings.model = targetModel;
    activeThreads.set(threadId, currentSettings);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: `🔄 Model switched to **${targetModel.toUpperCase()}**.` });
    return;
  }

  try {
    const responseText = await callChatAnywhereAI(input, currentSettings.model);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: responseText });
  } catch (error) {
    console.error('Sim Manual Error:', error);
  }
};

export const handleEvent = onEvent;
export const onChat = onEvent;
