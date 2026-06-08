import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// Cache para subaybayan ang thread at message mapping kapag nagre-reply ang admin/user
export const replyTracking = new Map<string, {
  type: 'reply' | 'calladmin';
  author: string;
  threadId: string;
  originalMessageId: string;
}>();

export const config: CommandConfig = {
  name: 'callad',
  aliases: ['report', 'feedback'],
  version: '1.0.1',
  author: 'NTKhang, ManhG Fix & Zephyrus',
  role: Role.ANYONE, // Kahit sino pwedeng mag-report
  description: "Report bot's error or send comments straight to the bot admin.",
  category: 'group',
  hasPrefix: true,
  cooldown: 5,
  options: [
    {
      type: OptionType.string,
      name: 'content',
      description: 'The error or comment you want to report',
      required: true,
    },
  ],
};

// Nilipat at inayos ang handleReply/onReply logic para sa message context ng framework mo
export const onReply = async ({ chat, message }: AppCtx & { message: any }): Promise<void> => {
  const body = (message?.body || message?.text || '').trim();
  const replyTo = message?.messageReply;
  if (!body || !replyTo) return;

  const savedReply = replyTracking.get(replyTo.messageID);
  if (!savedReply) return;

  const senderName = message?.senderName || 'User';

  // Kapag si Admin ang nag-reply sa feedback
  if (savedReply.type === 'calladmin') {
    try {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `📌 **Feedback from admin ${senderName} to you:**\n--------\n${body}\n--------\n» 💬 *Reply to this message to continue sending reports to admin.*`,
      });
    } catch (error) {
      console.error('Error sending admin reply:', error);
    }
  } 
  // Kapag ang User naman ang sumagot pabalik sa report
  else if (savedReply.type === 'reply') {
    const adminBots = (global as any).config?.ADMINBOT || ["100080620386598"]; // Default active admin IDs
    for (const adminId of adminBots) {
      try {
        await chat.replyMessage({
          style: MessageStyle.MARKDOWN,
          message: `📄 **Feedback from ${senderName}:**\n${body}`,
        });
      } catch (error) {
        console.error('Error forwarding feedback to admin:', error);
      }
    }
  }
};

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const content = args.join(' ').trim();
  const threadId = (chat as any).threadID || (chat as any).chatID || (chat as any).id || 'default_thread';
  const senderId = (chat as any).senderID || 'default_user';
  const senderName = (chat as any).senderName || 'User';

  if (!content) {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ **You have not entered the content to report.**' });
    return;
  }

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });

  // Paunang feedback sa user na natanggap ang report nila
  await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: `At: \`${timestamp}\`\nYour report has been sent to the bot admins!`,
  });

  const adminBots = (global as any).config?.ADMINBOT || ["100080620386598"];
  const boxName = (chat as any).threadName || 'Group Chat';

  // I-forward sa lahat ng config admins ang report kasama ang IDs
  for (const adminId of adminBots) {
    try {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `👤 **Report from:** ${senderName}\n👨‍👩‍👧‍👧 **Box:** ${boxName}\n🔰 **ID Box:** \`${threadId}\`\n🔷 **ID User:** \`${senderId}\`\n-----------------\n⚠️ **Error:** ${content}\n-----------------\nTime: ${timestamp}`,
      });
    } catch (error) {
      console.error(`Failed to send report to admin ${adminId}:`, error);
    }
  }
};

export const handleReply = onReply;
