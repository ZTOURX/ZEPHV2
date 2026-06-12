import type { AppCtx } from '@/engine/types/controller.types.js'
import { Role } from '@/engine/constants/role.constants.js'
import { MessageStyle } from '@/engine/constants/message-style.constants.js'
import type { CommandConfig } from '@/engine/types/module-config.types.js'

export const config: CommandConfig = {
  name: 'callad',
  version: '1.0.1',
  role: Role.ANYONE,
  author: 'NTKhang, ManhG Fix Get',
  description: 'Report bot errors or send comments to admins',
  usage: '[error encountered or comments]',
  cooldown: 5,
  hasPrefix: true,
}

// NOTE — ADMIN ID BROADCAST:
//   The original iterated global.config.ADMINBOT to DM every admin.
//   Cat Bot has no ctx API to enumerate admin IDs at runtime inside a handler.
//   Set ADMIN_THREAD_ID to the admin's platform user ID (or DM thread ID).
//   For multi-admin broadcast, call onCommand for each ID manually here.
const ADMIN_THREAD_ID = '100092470756002'

const STATE = {
  awaiting_admin_reply: 'awaiting_admin_reply',
  awaiting_user_reply: 'awaiting_user_reply',
}

export const onReply = {
  // Admin received the report and replied → relay back to user
  [STATE.awaiting_admin_reply]: async ({ chat, session, event, state, user }: AppCtx) => {
    const adminReply = event['message'] as string
    const originalThreadID = session.context['originalThreadID'] as string
    const originalMessageID = session.context['originalMessageID'] as string
    const reporterName = session.context['reporterName'] as string
    const senderID = event['senderID'] as string
    const adminName = await user.getName(senderID)

    state.delete(session.id)

    const msgId = await chat.reply({
      style: MessageStyle.MARKDOWN,
      message:
        `📌 **Feedback from admin ${adminName} to you:**\n` +
        `--------\n` +
        `${adminReply}\n` +
        `--------\n` +
        `» 💬 Reply to this message to continue sending reports to admin`,
      thread_id: originalThreadID,
      reply_to_message_id: originalMessageID,
    })

    if (msgId) {
      state.create({
        id: state.generateID({ id: String(msgId) }),
        state: STATE.awaiting_user_reply,
        context: { reporterName, adminName },
      })
    }
  },

  // User replied to admin's feedback → forward back to admin
  [STATE.awaiting_user_reply]: async ({ chat, session, event, state, user }: AppCtx) => {
    const userMessage = event['message'] as string
    const senderID = event['senderID'] as string
    const threadID = event['threadID'] as string
    const messageID = event['messageID'] as string
    const senderName = await user.getName(senderID)

    state.delete(session.id)

    const msgId = await chat.reply({
      style: MessageStyle.MARKDOWN,
      message: `📄 **Feedback from ${senderName}:**\n${userMessage}`,
      thread_id: ADMIN_THREAD_ID,
    })

    if (msgId) {
      state.create({
        id: state.generateID({ id: String(msgId) }),
        state: STATE.awaiting_admin_reply,
        context: {
          originalThreadID: threadID,
          originalMessageID: messageID,
          reporterName: senderName,
        },
      })
    }
  },
}

export const onCommand = async ({ chat, args, event, state, user }: AppCtx): Promise<void> => {
  const reportText = args.join(' ').trim()

  if (!reportText) {
    await chat.replyMessage({
      style: MessageStyle.TEXT,
      message: 'You have not entered the content to report.',
    })
    return
  }

  const senderID = event['senderID'] as string
  const threadID = event['threadID'] as string
  const messageID = event['messageID'] as string
  const senderName = await user.getName(senderID)
  const now = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })

  // Confirm to reporter
  await chat.replyMessage({
    style: MessageStyle.TEXT,
    message: `At: ${now}\nYour report has been sent to the bot admins.`,
  })

  // Send report to admin thread
  const msgId = await chat.reply({
    style: MessageStyle.MARKDOWN,
    message:
      `👤 **Report from:** ${senderName}\n` +
      `👨‍👩‍👧‍👧 **Thread ID:** ${threadID}\n` +
      `🔷 **User ID:** ${senderID}\n` +
      `-----------------\n` +
      `⚠️ **Report:** ${reportText}\n` +
      `-----------------\n` +
      `🕐 **Time:** ${now}`,
    thread_id: ADMIN_THREAD_ID,
  })

  if (msgId) {
    state.create({
      id: state.generateID({ id: String(msgId) }),
      state: STATE.awaiting_admin_reply,
      context: {
        originalThreadID: threadID,
        originalMessageID: messageID,
        reporterName: senderName,
      },
    })
  }
}
