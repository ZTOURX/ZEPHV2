import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'cmd',
  aliases: ['module', 'manager'],
  version: '1.0.4',
  author: 'Zephyrus Wym',
  role: Role.ADMIN,
  description: 'Manage and control all bot modules',
  category: 'Admin',
  hasPrefix: true,
  cooldown: 5,
  options: [
    {
      type: OptionType.string,
      name: 'action',
      description: 'Actions: count, load, unload, loadAll, info',
      required: true,
    }
  ],
};

const PERMITTED_ADMINS = ["100080620386598", "100074156839173"];

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const senderId = (chat as any).senderID || '';
  
  if (!PERMITTED_ADMINS.includes(senderId)) {
    await chat.replyMessage({ 
      style: MessageStyle.MARKDOWN, 
      message: '❌ Access Denied: Authorized operators only.' 
    });
    return;
  }

  const action = args[0]?.toLowerCase();
  const commandsMap = (global as any).client?.commands || new Map();

  if (action === 'count') {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `📊 Total modules loaded: ${commandsMap.size}`,
    });
  } else if (action === 'info') {
    const target = args[1] || '';
    const cmd = commandsMap.get(target);
    if (!cmd) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Module not found in registry.' });
    } else {
      const info = cmd.config || {};
      const msg = [
        `=== ${info.name?.toUpperCase() || 'COMMAND'} ===`,
        `- Author: ${info.author || 'Zephyrus'}`,
        `- Version: ${info.version || '1.0.0'}`,
        `- Category: ${info.category || 'General'}`,
        `- Cooldown: ${info.cooldown || 0}s`
      ].join('\n');
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: msg });
    }
  } else {
    await chat.replyMessage({ 
      style: MessageStyle.MARKDOWN, 
      message: '💡 Command Manager:\n- /cmd count\n- /cmd info <moduleName>' 
    });
  }
};
