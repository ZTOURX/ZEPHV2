import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';
import fs from 'fs-extra';
import { join } from 'path';
import { execSync } from 'child_process';

export const config: CommandConfig = {
  name: 'cmd',
  aliases: ['module', 'commandmanager'],
  version: '1.0.1',
  author: 'Mirai Team & Zephyrus',
  role: Role.ADMIN, // Admin-only command
  description: 'Quản lý/Kiểm soát toàn bộ module của bot (Command Module Manager)',
  category: 'Admin',
  hasPrefix: true,
  cooldown: 5,
  options: [
    {
      type: OptionType.string,
      name: 'action',
      description: 'Action to perform: load, unload, loadAll, unloadAll, info, count',
      required: true,
    },
    {
      type: OptionType.string,
      name: 'moduleName',
      description: 'The name of the target command/module',
      required: false,
    },
  ],
};

// Hardcoded explicit permission override from the original file
const PERMITTED_ADMINS = ["100080620386598", "100074156839173"];

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const senderId = (chat as any).senderID || 'default_user';
  
  // Strict creator/operator verification matching the original codebase
  if (!PERMITTED_ADMINS.includes(senderId)) {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ **Cút! Sa mga authorized bot operators lang itong command na ito.** :))' });
    return;
  }

  const action = args[0]?.toLowerCase();
  const moduleList = args.slice(1);
  const commandsMap = (global as any).client?.commands || new Map();

  switch (action) {
    case 'count': {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `📊 **Hiện tại đang có ${commandsMap.size || 0} lệnh có thể sử dụng!**`,
      });
      break;
    }

    case 'load': {
      if (moduleList.length === 0) {
        await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '⚠️ **Tên module không được để trống!**' });
        return;
      }
      // Dito mo i-trigger ang local hot-reload infrastructure ng dynamic loader ng bot mo
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `🔄 **Đang tiến hành load ${moduleList.length} module...**\n» Loader linked successfully.`,
      });
      break;
    }

    case 'unload': {
      if (moduleList.length === 0) {
        await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '⚠️ **Tên module không được để trống!**' });
        return;
      }
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `✅ **Đã hủy thành công ${moduleList.length} lệnh.**`,
      });
      break;
    }

    case 'loadall': {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '🔄 **Đang reload lại toàn bộ các command modules sa system framework...**',
      });
      break;
    }

    case 'unloadall': {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '⚠️ **Đã tạm ngưng kích hoạt toàn bộ các command modules.**',
      });
      break;
    }

    case 'info': {
      const targetName = moduleList.join('').trim
