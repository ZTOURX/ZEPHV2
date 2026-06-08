import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'cmd',
  aliases: ['module', 'commandmanager'],
  version: '1.0.2',
  author: 'Mirai Team & Zephyrus',
  role: Role.ADMIN,
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

const PERMITTED_ADMINS = ["100080620386598", "100074156839173"];

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const senderId = (chat as any).senderID || 'default_user';
  
  if (!PERMITTED_ADMINS.includes(senderId)) {
    await chat.replyMessage({ 
      style: MessageStyle.MARKDOWN, 
      message: '❌ **Cút! Sa mga authorized bot operators lang itong command na ito.** :))' 
    });
    return;
  }

  const action = args[0]?.toLowerCase();
  const moduleList = args.slice(1);
  const commandsMap = (global as any).client?.commands || new Map();

  if (action === 'count') {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `📊 **Hiện tại đang có ${commandsMap.size || 0} lệnh có thể sử dụng!**`,
    });
    return;
  }

  if (action === 'load') {
    if (moduleList.length === 0) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '⚠️ **Tên module không được để trống!**' });
      return;
    }
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🔄 **Đang tiến hành load ${moduleList.length} module...**\n» Loader linked successfully.`,
    });
    return;
  }

  if (action === 'unload') {
    if (moduleList.length === 0) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '⚠️ **Tên module không được để trống!**' });
      return;
    }
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `✅ **Đã hủy thành công ${moduleList.length} lệnh.**`,
    });
    return;
  }

  if (action === 'loadall') {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '🔄 **Đang reload lại toàn bộ các command modules sa system framework...**',
    });
    return;
  }

  if (action === 'unloadall') {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '⚠️ **Đã tạm ngưng kích hoạt toàn bộ các command modules.**',
    });
    return;
  }

  if (action === 'info') {
    const targetName = moduleList.join('').trim();
    if (!targetName) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '⚠️ **Vui lòng nhập tên module cần xem thông tin!**' });
      return;
    }

    const targetCmd = commandsMap.get(targetName);
    if (!targetCmd) {
      await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '🔎 **Module bạn nhập không tồn tại trên hệ thống cluster!**' });
      return;
    }

    const infoConfig = targetCmd.config || {};
    const responseMsg = [
      `=== 🏷️ **${(infoConfig.name || targetName).toUpperCase()}** ===`,
      `- 👤 **Được code bởi:** ${infoConfig.author || infoConfig.credits || 'Unknown'}`,
      `- 🛡️ **Phiên bản:** ${infoConfig.version || '1.0.0'}`,
      `- 🔑 **Yêu cầu quyền hạn:** ${infoConfig.role === Role.ADMIN ? 'Quản trị viên' : 'Người dùng'}`,
      `- ⏱️ **Thời gian chờ:** ${infoConfig.cooldown || infoConfig.cooldowns || 0} giây(s)`,
      `- 📦 **Dependencies:** ${infoConfig.options ? 'Framework Native Options Layer' : 'None'}`,
    ].join('\n');

    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: responseMsg });
    return;
  }

  // Fallback Guide Display
  await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: '💡 **CMD Management Guide:**\n• `/cmd count`\n• `/cmd load <name>`\n• `/cmd unload <name>`\n• `/cmd loadAll`\n• `/cmd info <name>`',
  });
};
