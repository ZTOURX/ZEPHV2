import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'cmd',
  aliases: ['module', 'commandmanager'],
  version: '1.0.1',
  author: 'Zephyrus Wym',
  role: Role.BOT_ADMIN, // Changed from ADMIN to BOT_ADMIN
  description: 'Manage bot modules',
  category: 'Admin',
  hasPrefix: true,
  cooldown: 5,
};

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const action = args[0]?.toLowerCase();

  switch (action) {
    case 'count': {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '📊 **System is running smoothly.**',
      });
      break;
    }
    default: {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: 'Available commands: `cmd count`',
      });
    }
  }
};
