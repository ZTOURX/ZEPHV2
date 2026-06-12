import type { AppCtx } from '@/engine/types/controller.types.js'
import { Role } from '@/engine/constants/role.constants.js'
import { MessageStyle } from '@/engine/constants/message-style.constants.js'
import type { CommandConfig } from '@/engine/types/module-config.types.js'
import { existsSync, readdirSync, createReadStream } from 'fs'
import { copyFile, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

export const config: CommandConfig = {
  name: 'sendfile',
  version: '1.0.0',
  role: Role.BOT_ADMIN,
  author: 'D-Jukie',
  description: 'Send a command .js file (as .txt attachment) to a user or thread',
  usage: '<filename.js>',
  cooldown: 0,
  hasPrefix: true,
}

// NOTE — hardcoded senderID allowlist ("Joshua Sy only"):
//   Replaced by role: Role.BOT_ADMIN. The engine enforces this before onCommand runs.
//
// NOTE — string-similarity package:
//   Replaced with an inline Dice coefficient — no extra dependency needed.
//
// NOTE — handleReaction (global.client.handleReaction):
//   This is Mirai/FCA-specific. Cat Bot's equivalent is onReact.
//   The reaction confirmation flow is ported using state.create + onReact.

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Dice coefficient similarity (replaces string-similarity package) ──────────
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const bigrams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2)
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1)
  }
  let intersect = 0
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2)
    const n = bigrams.get(bg) ?? 0
    if (n > 0) { bigrams.set(bg, n - 1); intersect++ }
  }
  return (2.0 * intersect) / (a.length + b.length - 2)
}

function bestMatch(target: string, list: string[]): { name: string; rating: number } | null {
  let best: { name: string; rating: number } | null = null
  for (const c of list) {
    const r = diceSimilarity(target, c)
    if (!best || r > best.rating) best = { name: c, rating: r }
  }
  return best
}

// ── Shared: copy .js → .txt, send as attachment, delete .txt ─────────────────
async function sendJsAsAttachment(
  ctx: AppCtx,
  jsPath: string,
  fileName: string,
  destThreadID: string,
  replyToMessageID?: string,
): Promise<void> {
  const txtPath = jsPath.replace('.js', '.txt')
  await copyFile(jsPath, txtPath)
  try {
    await ctx.chat.reply({
      style: MessageStyle.TEXT,
      message: `» File ${fileName} here you are`,
      attachment: [{ name: fileName.replace('.js', '.txt'), stream: createReadStream(txtPath) }],
      thread_id: destThreadID,
      ...(replyToMessageID ? { reply_to_message_id: replyToMessageID } : {}),
    })
  } finally {
    await unlink(txtPath).catch(() => {})
  }
}

// ── onReact: emoji confirmation when file wasn't found exactly ────────────────
// Any emoji triggers the confirmation (the original just checked for any reaction)
const REACT_STATE_USER = 'confirm_send_user'
const REACT_STATE_THREAD = 'confirm_send_thread'

export const onReact = {
  [REACT_STATE_USER]: async ({ chat, event, session, state, user }: AppCtx) => {
    state.delete(session.id)

    const file = session.context['file'] as string
    const uid = session.context['uid'] as string
    const recipientName = session.context['recipientName'] as string
    const threadID = event['threadID'] as string
    const jsPath = join(__dirname, `${file}.js`)

    if (!existsSync(jsPath)) {
      await chat.replyMessage({ style: MessageStyle.TEXT, message: `File ${file}.js no longer exists.` })
      return
    }

    await chat.unsendMessage(session.context['botMessageID'] as string)
    await sendJsAsAttachment({ chat, event, session, state, user } as AppCtx, jsPath, `${file}.js`, uid)
    await chat.reply({
      style: MessageStyle.TEXT,
      message: `» Check your messages ${recipientName}`,
      thread_id: threadID,
    })
  },

  [REACT_STATE_THREAD]: async ({ chat, event, session, state }: AppCtx) => {
    state.delete(session.id)

    const file = session.context['file'] as string
    const threadID = event['threadID'] as string
    const replyToMsgID = event['messageID'] as string
    const jsPath = join(__dirname, `${file}.js`)

    if (!existsSync(jsPath)) {
      await chat.replyMessage({ style: MessageStyle.TEXT, message: `File ${file}.js no longer exists.` })
      return
    }

    await chat.unsendMessage(session.context['botMessageID'] as string)
    await sendJsAsAttachment({ chat, event, session, state } as AppCtx, jsPath, `${file}.js`, threadID, replyToMsgID)
  },
}

// ── onCommand ─────────────────────────────────────────────────────────────────
export const onCommand = async (ctx: AppCtx): Promise<void> => {
  const { chat, args, event, state, user } = ctx

  const fileName = args.join(' ').trim()
  if (!fileName) {
    await chat.replyMessage({ style: MessageStyle.TEXT, message: 'File name cannot be empty.' })
    return
  }
  if (!fileName.endsWith('.js')) {
    await chat.replyMessage({ style: MessageStyle.TEXT, message: 'The file extension must be .js' })
    return
  }

  const eventType = event['type'] as string
  const isReply = eventType === 'message_reply'
  const threadID = event['threadID'] as string
  const replyToMsgID = event['messageID'] as string

  // Resolve destination: DM the quoted message's sender, or current thread
  let destThreadID: string
  let recipientName: string | undefined
  let recipientID: string | undefined

  if (isReply) {
    const messageReply = event['messageReply'] as Record<string, unknown> | null
    recipientID = (messageReply?.['senderID'] as string | undefined) ?? (event['senderID'] as string)
    recipientName = await user.getName(recipientID)
    destThreadID = recipientID   // DM: use the user's ID as thread_id
  } else {
    destThreadID = threadID
  }

  const jsPath = join(__dirname, fileName)

  // ── File not found: fuzzy-match and offer via reaction ───────────────────
  if (!existsSync(jsPath)) {
    const allModules = readdirSync(__dirname)
      .filter(f => f.endsWith('.js'))
      .map(f => f.replace(/\.js$/, ''))

    const nameNoExt = fileName.replace(/\.js$/, '')
    const threshold = isReply ? 1.0 : 0.5
    const match = bestMatch(nameNoExt, allModules)

    if (!match || match.rating < threshold) {
      await chat.replyMessage({ style: MessageStyle.TEXT, message: `🔎 File not found: ${fileName}` })
      return
    }

    const botMsgId = await chat.replyMessage({
      style: MessageStyle.TEXT,
      message:
        `🔎 File not found: ${fileName}\n` +
        `🔎 ${isReply ? 'The file is similar to' : 'File almost like'}: ${match.name}.js\n` +
        `» Drop your reaction in this message to give it.`,
    })

    if (botMsgId) {
      const reactState = isReply ? REACT_STATE_USER : REACT_STATE_THREAD
      state.create({
        id: state.generateID({ id: String(botMsgId) }),
        state: [reactState],
        context: {
          file: match.name,
          botMessageID: String(botMsgId),
          ...(isReply ? { uid: recipientID, recipientName } : {}),
        },
      })
    }
    return
  }

  // ── File found: send immediately ─────────────────────────────────────────
  await sendJsAsAttachment(ctx, jsPath, fileName, destThreadID, isReply ? undefined : replyToMsgID)

  if (isReply && recipientName) {
    await chat.reply({
      style: MessageStyle.TEXT,
      message: `» Check your messages ${recipientName}`,
      thread_id: threadID,
    })
  }
}
