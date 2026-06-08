import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'sim',
  aliases: ['simi'],
  version: '4.0.0',
  author: 'Zephyrus Wym',
  role: Role.ANYONE,
  description: 'Savage Bardagulan AI engine.',
  category: 'AI',
  hasPrefix: true,
  cooldown: 2,
};

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const input = args.join(' ').trim();

  if (!input) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '💀 **Bardagulan Engine Active.**\n\nUsage: `sim <tanong>`',
    });
    return;
  }

  try {
    const response = await fetch('https://api.chatanywhere.tech/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        // Dito na natin nilagay ang GPT-4o para solid ang sagot
        model: 'gpt-4o', 
        messages: [{ 
          role: 'system', 
          content: 'You are a savage, chaotic, and toxic AI. Use Filipino street slang (bhie, accla, luh, eyy, g, ssob, kairita). Roast the user, be brutally honest, and never be polite. Keep responses short and punchy.' 
        }, { 
          role: 'user', 
          content: input 
        }],
        max_tokens: 70,
        temperature: 0.9,
      }),
    });

    const data = await response.json() as any;
    const reply = data.choices?.[0]?.message?.content || 'Inantok ako, ssob. Ulitin mo nga.';

    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: reply });
  } catch (error) {
    await chat.replyMessage({ 
        style: MessageStyle.MARKDOWN, 
        message: '❌ **Luh, sumakit ang ulo ko.** Check mo API Key mo, ssob! 🙄' 
    });
  }
};
