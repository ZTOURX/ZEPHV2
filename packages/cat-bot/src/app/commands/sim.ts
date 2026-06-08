import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '1.0.0',
  author: 'Zephyrus Wym',
  role: Role.ANYONE,
  description: 'AI Bardagulan engine with persistent toggle.',
  category: 'AI',
  hasPrefix: true,
  cooldown: 5,
};

const callAI = async (text: string, model: string): Promise<string> => {
  const apiKey = process.env.PROVIDER_API_KEY || '';
  const response = await fetch('https://api.chatanywhere.tech/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model === 'gpt4' ? 'gpt-4o' : 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a savage, chaotic AI. Speak in Taglish slang. Be short and roast the user.' },
        { role: 'user', content: text }
      ],
      max_tokens: 70
    }),
  });
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || 'Inantok ako, ssob.';
};

export const onCommand = async ({ chat, args, event, db }: AppCtx): Promise<void> => {
  const threadId = event.threadID;
  const collection = await db.bot.getCollection('sim_config');
  let data = (await collection.get(threadId)) || { isOn: false, model: 'deepseek' };

  const input = args.join(' ').toLowerCase();

  if (input === 'on') {
    data.isOn = true;
    await collection.set(threadId, data);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: 'Sim Auto-Reply is now ON! 🖕' });
  } else if (input === 'off') {
    data.isOn = false;
    await collection.set(threadId, data);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: 'Sim Auto-Reply is now OFF.' });
  } else if (input.startsWith('model')) {
    data.model = args[1] || 'deepseek';
    await collection.set(threadId, data);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: `Model set to ${data.model}` });
  } else if (input.length > 0) {
    const reply = await callAI(input, data.model);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: reply });
  }
};

export const onEvent = async ({ chat, event, db }: AppCtx): Promise<void> => {
  if (event.senderID === event.botID) return;
  
  const collection = await db.bot.getCollection('sim_config');
  const data = await collection.get(event.threadID);
  
  if (data?.isOn) {
    const reply = await callAI(event.body || '', data.model);
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: reply });
  }
};
