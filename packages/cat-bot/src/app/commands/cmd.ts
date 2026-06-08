import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/modules/command/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'cmd',
  aliases: ['module', 'commandmanager'],
  version: '1.0.1',
  author: 'Zephyrus Wym',
  role: Role.BOT_ADMIN, // System-level admin role
  description: 'Manage bot modules, including loading, unloading, and status checks.',
  category: 'Admin',
  hasPrefix: true,
  cooldown: 5,
};

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const action = args[0]?.toLowerCase();
  const commandsMap = (global as any).client?.commands || new Map();

  switch (action) {
    case 'count': {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `📊 **Currently, there are ${commandsMap.size || 0} active modules.**`,
      });
      break;
    }
    default: {
      await chat.replyMessage({ 
        style: MessageStyle.MARKDOWN, 
        message: 'Usage: `cmd [count | load | unload]`' 
      });
    }
  }
};
