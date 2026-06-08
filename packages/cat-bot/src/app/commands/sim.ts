import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

import { readFileSync, writeFileSync, existsSync } from 'fs';

const BASE_URL = 'https://api.chatanywhere.tech/v1';
const DB_PATH = './sim-data.json';

type ThreadState = {
  isOn: boolean;
  model: string;
  memory: { role: 'user' | 'assistant'; content: string }[];
};

const loadDB = (): Record<string, ThreadState> => {
  if (!existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return {};
  }
};

let db = loadDB();

const saveDB = () => {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
};

const getThread = (id: string): ThreadState => {
  if (!db[id]) {
    db[id] = {
      isOn: false,
      model: 'deepseek',
      memory: [],
    };
    saveDB();
  }
  return db[id];
};

const updateThread = (id: string, data: ThreadState) => {
  db[id] = data;
  saveDB();
};

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '6.0.0',
  author: 'Zephyrus Wym',
  role: Role.ANYONE,
  description: 'Persistent Bardagulan AI (cat-bot)',
  category: 'AI',
  hasPrefix: true,
  cooldown: 0,
  options: [
    {
      type: OptionType.string,
      name: 'text',
      description: 'message / on / off / model <name>',
      required: true,
    },
  ],
};

const askAI = async (
  input: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  model: string
) => {
  const apiKey = process.env.PROVIDER_API_KEY || '';
  if (!apiKey) throw new Error('Missing API KEY');

  let modelId = 'deepseek-chat';
  if (model === 'gpt3') modelId = 'gpt-3.5-turbo';
  if (model === 'gpt4') modelId = 'gpt-4o-mini';
  if (model === 'gpt5') modelId = 'gpt-4o';

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'system',
          content:
            'You are Sim, a chaotic Taglish bardagulan chatbot. Short replies only.',
        },
        ...history,
        { role: 'user', content: input },
      ],
      max_tokens: 120,
      temperature: 0.9,
    }),
  });

  if (!res.ok) throw new Error('API ERROR');

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '...';
};

export const onEvent = async ({ chat, message }: AppCtx & { message: any }) => {
  const body = message?.body?.trim();
  if (!body) return;

  if (body.startsWith('/') || body.startsWith('!') || body.startsWith('sim'))
    return;

  const threadId =
    (chat as any).threadID ||
    (chat as any).chatID ||
    (chat as any).id ||
    'default';

  const thread = getThread(threadId);

  if (!thread.isOn) return;

  thread.memory = thread.memory.slice(-12);

  try {
    const reply = await askAI(body, thread.memory, thread.model);

    thread.memory.push({ role: 'user', content: body });
    thread.memory.push({ role: 'assistant', content: reply });

    updateThread(threadId, thread);

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: reply,
    });
  } catch (err) {
    console.error('EVENT ERROR:', err);
  }
};

export const onCommand = async ({ chat, args }: AppCtx) => {
  const input = args.join(' ').trim();

  const threadId =
    (chat as any).threadID ||
    (chat as any).chatID ||
    (chat as any).id ||
    'default';

  const thread = getThread(threadId);

  if (!input) {
    return chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message:
        'SIM COMMANDS:\n• sim on\n• sim off\n• sim model <gpt3|gpt4|gpt5>\n• sim <message>',
    });
  }

  if (input === 'on') {
    thread.isOn = true;
    updateThread(threadId, thread);

    return chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '🔥 SIM ON',
    });
  }

  if (input === 'off') {
    thread.isOn = false;
    updateThread(threadId, thread);

    return chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💤 SIM OFF',
    });
  }

  if (args[0] === 'model' && args[1]) {
    thread.model = args[1].toLowerCase();
    updateThread(threadId, thread);

    return chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `MODEL: ${thread.model}`,
    });
  }

  try {
    const reply = await askAI(input, thread.memory, thread.model);

    thread.memory.push({ role: 'user', content: input });
    thread.memory.push({ role: 'assistant', content: reply });

    thread.memory = thread.memory.slice(-12);

    updateThread(threadId, thread);

    return chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: reply,
    });
  } catch (err) {
    console.error('COMMAND ERROR:', err);
  }
};

export const handleEvent = onEvent;
export const onChat = onEvent;
