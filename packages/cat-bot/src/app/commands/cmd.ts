import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/modules/command/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'sendfile',
  aliases: ['givefile', 'getfile'],
  version: '1.0.0',
  author: 'Zephyrus Wym',
  role: Role.SYSTEM_ADMIN, // System-level admin role
  description: 'Retrieve server source code files for administrative purposes.',
  category: 'Admin',
  hasPrefix: true,
  cooldown: 0,
};

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const fileNameInput = args.join(' ').trim();
  
  if (!fileNameInput) {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Error: File name cannot be empty.' });
    return;
  }

  // Logic is now handled by the framework's Role-based middleware
  await chat.replyMessage({ 
      style: MessageStyle.MARKDOWN, 
      message: `✅ Command accepted for: **${fileNameInput}**.` 
  });
};
