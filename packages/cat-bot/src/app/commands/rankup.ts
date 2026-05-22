/**
 * /rankup — Passive EXP System + Per-Thread Level-Up Notifications
 *
 * Two responsibilities unified in one module:
 *
 *   onChat    — fires on EVERY message (passive XP accumulation)
 *               +1 EXP per message; notifies the thread when a user levels up,
 *               if rankup notifications are enabled for that thread.
 *               On level-up, sends a rank card image via the Wajiro API.
 *
 *               Platform card routing:
 *                 Telegram            → /api/v1/rankup-card3  (full fields, always)
 *                 Discord / Messenger → randomly one of:
 *                   • /api/v1/rankup-card2  (full fields: username, level, xp, rank)
 *                   • /api/v1/rankup-card   (avatar only — styled preset)
 *
 *   onCommand — /rankup [on | off | test]
 *               on / off — toggle level-up notifications (THREAD_ADMIN only).
 *               test     — sends a preview rank card for the caller's current
 *                          level without requiring an actual level-up.
 *
 * EXP collection schema (bot_users_session.data → "xp" key):
 *   { exp: number }  — raw accumulated experience points
 *
 * Thread settings schema (bot_threads_session.data → "rankup_settings" key):
 *   { enabled: boolean }  — defaults to true when key is absent (fail-open)
 *
 * The same DELTA_NEXT and level formula used here must match rank.ts.
 * Extract to a shared utility if additional economy commands are added.
 */

import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { ButtonStyle } from '@/engine/constants/button-style.constants.js';
import { hasNativeButtons } from '@/engine/utils/ui-capabilities.util.js';
import { createUrl } from '@/engine/utils/api.util.js';
import { Platforms } from '@/engine/modules/platform/platform.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Must match the constant in rank.ts — controls EXP-to-level curve. */
const DELTA_NEXT = 5;

/** Name of the collection inside bot_threads_session.data for rankup settings. */
const SETTINGS_COLLECTION = 'rankup_settings';

// ─── Level Maths ──────────────────────────────────────────────────────────────

/** Converts raw EXP to a level number. Mirrors rank.ts implementation. */
function expToLevel(exp: number): number {
  if (exp <= 0) return 0;
  return Math.floor((1 + Math.sqrt(1 + (8 * exp) / DELTA_NEXT)) / 2);
}

/** Minimum EXP required to reach a specific level. Mirrors rank.ts implementation. */
function levelToExp(level: number): number {
  if (level <= 0) return 0;
  return Math.floor(((level * level - level) * DELTA_NEXT) / 2);
}

// ─── Module Config ────────────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'rankup',
  aliases: [] as string[],
  version: '1.1.0',
  role: Role.THREAD_ADMIN,
  author: 'John Lester',
  description:
    'Toggle level-up notifications for this thread (on/off). Gains EXP passively on every message. Use "check" to preview the rank card.',
  category: 'Economy',
  usage: '[on | off | check]',
  cooldown: 5,
  hasPrefix: true,
  options: [
    {
      type: OptionType.string,
      name: 'action',
      description: 'Toggle state: "on", "off", or "check"',
      required: false,
    },
  ],
};

// ─── Card Variants ────────────────────────────────────────────────────────────

/**
 * Card variant descriptors for Discord / Facebook Messenger.
 * One is picked at random on each level-up so the notification never feels stale.
 *
 *   FULL   → /api/v1/rankup-card2 — styled card with username, level, XP bar, rank badge
 *   SIMPLE → /api/v1/rankup-card  — avatar-only preset (no extra fields required)
 */
type CardVariant = 'FULL' | 'SIMPLE';

function pickRandomVariant(): CardVariant {
  return Math.random() < 0.5 ? 'FULL' : 'SIMPLE';
}

// ─── Card Builder ─────────────────────────────────────────────────────────────

/**
 * Builds a rank-up card image via the platform-appropriate Wajiro endpoint.
 *
 * Routing table
 * ┌──────────────────────┬────────────────────┬──────────────────────────────┐
 * │ Platform             │ Endpoint           │ Fields                       │
 * ├──────────────────────┼────────────────────┼──────────────────────────────┤
 * │ Telegram             │ /rankup-card3      │ avatar + full metadata       │
 * │ Discord / Messenger  │ /rankup-card2 (*)  │ avatar + full metadata       │
 * │ Discord / Messenger  │ /rankup-card  (*)  │ avatar only                  │
 * └──────────────────────┴────────────────────┴──────────────────────────────┘
 * (*) chosen randomly on each invocation — pass `variant` to override.
 *
 * @param avatarUrl    Public URL of the user's avatar image.
 * @param username     Display name shown on the card.
 * @param currentLevel The level the user just reached.
 * @param newExp       User's total EXP after the increment.
 * @param rank         Leaderboard position (1-based).
 * @param platform     Runtime platform string from native.platform.
 * @param variant      Override the random variant (optional; ignored for Telegram).
 *
 * @returns Image buffer on success, or null when any step fails.
 */
async function buildRankupCard(
  avatarUrl: string,
  username: string,
  currentLevel: number,
  newExp: number,
  rank: number,
  platform: string,
  variant?: CardVariant,
): Promise<Buffer | null> {
  // Download the avatar as a raw buffer — the API requires a multipart file upload,
  // not a URL reference, so we must resolve and stream the image ourselves.
  const avatarRes = await fetch(avatarUrl);
  if (!avatarRes.ok) return null;
  const avatarBuffer = Buffer.from(await avatarRes.arrayBuffer());

  const avatarBlob = new Blob([avatarBuffer], { type: 'image/png' });
  const form = new FormData();
  form.append('avatar', avatarBlob, 'avatar.png');

  let apiUrl: string | null;

  if (platform === Platforms.Telegram) {
    // ── Telegram: always use rankup-card3 (full-field card) ─────────────────
    apiUrl = createUrl('wajiro', '/api/v1/rankup-card3');
    if (!apiUrl) return null;

    // EXP values relative to the current level span.
    const currentBase = levelToExp(currentLevel);
    const nextBase    = levelToExp(currentLevel + 1);
    const currentXp   = newExp - currentBase;
    const requiredXp  = nextBase - currentBase;

    form.append('username',   username);
    form.append('level',      String(currentLevel));
    form.append('currentXp',  String(currentXp));
    form.append('requiredXp', String(requiredXp));
    form.append('rank',       String(rank));
  } else {
    // ── Discord / Messenger: randomly pick between two card styles ───────────
    const chosen = variant ?? pickRandomVariant();

    if (chosen === 'SIMPLE') {
      // /rankup-card — avatar only; all styling is server-side
      apiUrl = createUrl('wajiro', '/api/v1/rankup-card');
      if (!apiUrl) return null;
      // No extra fields beyond the avatar already appended above.
    } else {
      // /rankup-card2 — full metadata card
      apiUrl = createUrl('wajiro', '/api/v1/rankup-card2');
      if (!apiUrl) return null;

      const currentBase = levelToExp(currentLevel);
      const nextBase    = levelToExp(currentLevel + 1);
      const currentXp   = newExp - currentBase;
      const requiredXp  = nextBase - currentBase;

      form.append('username',   username);
      form.append('level',      String(currentLevel));
      form.append('currentXp',  String(currentXp));
      form.append('requiredXp', String(requiredXp));
      form.append('rank',       String(rank));
    }
  }

  const cardRes = await fetch(apiUrl, { method: 'POST', body: form });
  if (!cardRes.ok) return null;

  return Buffer.from(await cardRes.arrayBuffer());
}

// ─── Passive EXP (onChat) ─────────────────────────────────────────────────────

/**
 * Passive EXP accumulator — runs for every message before command dispatch.
 *
 * Reads current EXP, increments by 1, writes back. If the new EXP crosses a
 * level boundary AND rankup notifications are enabled for this thread, sends a
 * rank-up card image from the Wajiro API. Falls back to a plain congratulation
 * text message when the avatar fetch or API call fails. Errors are swallowed —
 * a failing EXP write must never block the message pipeline.
 */
export const onChat = async ({ event, db, chat, user, native }: AppCtx): Promise<void> => {
  const senderID = event['senderID'] as string | undefined;
  const threadID = event['threadID'] as string | undefined;
  if (!senderID || !threadID) return;

  const userColl = db.users.collection(senderID);
  try {
    if (!(await userColl.isCollectionExist('xp'))) {
      await userColl.createCollection('xp');
    }
    const xpColl = await userColl.getCollection('xp');
    const oldExp = ((await xpColl.get('exp')) as number | undefined) ?? 0;
    const newExp = oldExp + 1;
    // Write before any notification so EXP is durable even if message.send fails.
    await xpColl.set('exp', newExp);

    const oldLevel = expToLevel(oldExp);
    const newLevel = expToLevel(newExp);
    if (newLevel <= oldLevel || newLevel <= 1) return;

    // Read thread setting — fail-open: treat any error as enabled=true
    let rankupEnabled = true;
    try {
      const threadColl = db.threads.collection(threadID);
      if (await threadColl.isCollectionExist(SETTINGS_COLLECTION)) {
        const settings = await threadColl.getCollection(SETTINGS_COLLECTION);
        rankupEnabled = ((await settings.get('enabled')) as boolean | undefined) ?? true;
      }
    } catch {
      rankupEnabled = true;
    }
    if (!rankupEnabled) return;

    const name = await db.users.getName(senderID);

    // ── Leaderboard rank ─────────────────────────────────────────────────────
    let leaderboardRank = 1;
    try {
      const allSessions = await db.users.getAll();
      const sorted = allSessions
        .map(({ botUserId, data }) => {
          const xpData = data?.['xp'] as Record<string, unknown> | undefined;
          const userExp =
            xpData && typeof xpData['exp'] === 'number' ? (xpData['exp'] as number) : 0;
          return { botUserId, exp: userExp };
        })
        .sort((a, b) => b.exp - a.exp);
      const pos = sorted.findIndex((u) => u.botUserId === senderID);
      if (pos !== -1) leaderboardRank = pos + 1;
    } catch {
      leaderboardRank = 1;
    }

    // ── Rank-up card ─────────────────────────────────────────────────────────
    // Attachment delivery is not supported on Facebook Page — skip card generation
    // and fall through directly to the text fallback.
    const isFacebookPage = native.platform === Platforms.FacebookPage;

    if (!isFacebookPage) {
      try {
        const avatarUrl = await user.getAvatarUrl(senderID);
        if (avatarUrl) {
          // variant is intentionally omitted here so Discord/Messenger randomises each time.
          const cardBuffer = await buildRankupCard(
            avatarUrl, name, newLevel, newExp, leaderboardRank, native.platform,
          );
          if (cardBuffer) {
            await chat.replyMessage({
              style: MessageStyle.MARKDOWN,
              message: `🎉 Congratulations **${name}**! You reached **level ${newLevel}**!`,
              attachment: [{ name: 'rankup.png', stream: cardBuffer }],
            });
            return;
          }
        }
      } catch {
        // Card generation failed — fall through to text fallback below
      }
    }

    // ── Text fallback ────────────────────────────────────────────────────────
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🎉 Congratulations **${name}**! You reached **level ${newLevel}**!`,
    });
  } catch {
    // Swallow all errors — EXP accumulation must never disrupt normal chat flow
  }
};

// ─── Button handlers ──────────────────────────────────────────────────────────

const BUTTON_ID = { my_level: 'my_level', back: 'back' } as const;

export const button = {
  [BUTTON_ID.my_level]: {
    label: '📊 My Level',
    style: ButtonStyle.SECONDARY,
    onClick: async ({ chat, event, db, native, button }: AppCtx) => {
      const senderID = event['senderID'] as string | undefined;
      const backId = button.generateID({ id: BUTTON_ID.back });
      if (!senderID) {
        await chat.editMessage({
          style: MessageStyle.MARKDOWN,
          message_id_to_edit: event['messageID'] as string,
          message: '❌ Could not identify your user ID on this platform.',
          ...(hasNativeButtons(native.platform) ? { button: [backId] } : {}),
        });
        return;
      }
      const userColl = db.users.collection(senderID);
      let exp = 0;
      if (await userColl.isCollectionExist('xp')) {
        const xpColl = await userColl.getCollection('xp');
        const rawExp = await xpColl.get('exp');
        exp = typeof rawExp === 'number' ? rawExp : 0;
      }
      const level = expToLevel(exp);
      await chat.editMessage({
        style: MessageStyle.MARKDOWN,
        message_id_to_edit: event['messageID'] as string,
        message: `⭐ **Level ${level}** — ${exp} total EXP`,
        ...(hasNativeButtons(native.platform) ? { button: [backId] } : {}),
      });
    },
  },
  [BUTTON_ID.back]: {
    label: '⬅ Back',
    style: ButtonStyle.SECONDARY,
    onClick: async (ctx: AppCtx) => onCommand(ctx),
  },
};

// ─── Command handler (onCommand) ─────────────────────────────────────────────

/**
 * Handles /rankup [on | off | test]
 *
 *   on / off — toggle rank-up notifications for the current thread (THREAD_ADMIN).
 *   check    — sends a preview rank card for the calling user at their current
 *              level, without requiring an actual level-up. Useful for verifying
 *              card API connectivity and checking which card style is active.
 *   (none)   — shows current setting + 📊 My Level button.
 */
export const onCommand = async ({
  chat,
  args,
  event,
  db,
  native,
  user,
  prefix = '',
  button,
}: AppCtx): Promise<void> => {
  const threadID = event['threadID'] as string | undefined;
  const senderID = event['senderID'] as string | undefined;

  if (!threadID) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: '❌ This command can only be used in a thread.',
    });
    return;
  }

  const sub = args[0]?.toLowerCase();

  // ── /rankup check ─────────────────────────────────────────────────────────
  if (sub === 'check') {
    if (!senderID) {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ Could not identify your user ID on this platform.',
      });
      return;
    }

    // Gather the caller's current XP / level for a realistic preview.
    let exp = 0;
    try {
      const userColl = db.users.collection(senderID);
      if (await userColl.isCollectionExist('xp')) {
        const xpColl = await userColl.getCollection('xp');
        const rawExp = await xpColl.get('exp');
        exp = typeof rawExp === 'number' ? rawExp : 0;
      }
    } catch { /* use 0 */ }

    const level = expToLevel(exp);

    // Leaderboard rank for the preview card.
    let leaderboardRank = 1;
    try {
      const allSessions = await db.users.getAll();
      const sorted = allSessions
        .map(({ botUserId, data }) => {
          const xpData = data?.['xp'] as Record<string, unknown> | undefined;
          const userExp =
            xpData && typeof xpData['exp'] === 'number' ? (xpData['exp'] as number) : 0;
          return { botUserId, exp: userExp };
        })
        .sort((a, b) => b.exp - a.exp);
      const pos = sorted.findIndex((u) => u.botUserId === senderID);
      if (pos !== -1) leaderboardRank = pos + 1;
    } catch { leaderboardRank = 1; }

    const isFacebookPage = native.platform === Platforms.FacebookPage;

    if (!isFacebookPage) {
      try {
        const avatarUrl = await user.getAvatarUrl(senderID);
        const name = await db.users.getName(senderID);

        if (avatarUrl) {
          // For the test command, try both variants back-to-back so the user
          // can see what each card style looks like. Randomise which is first.
          const firstVariant: CardVariant  = Math.random() < 0.5 ? 'FULL' : 'SIMPLE';
          const secondVariant: CardVariant = firstVariant === 'FULL' ? 'SIMPLE' : 'FULL';

          for (const variant of [firstVariant, secondVariant]) {
            const cardBuffer = await buildRankupCard(
              avatarUrl, name, level > 0 ? level : 1, exp > 0 ? exp : 1,
              leaderboardRank, native.platform, variant,
            );
            if (cardBuffer) {
              const label =
                native.platform === Platforms.Telegram
                  ? 'rankup-card3'
                  : variant === 'FULL'
                    ? 'rankup-card2'
                    : 'rankup-card';

              await chat.replyMessage({
                style: MessageStyle.MARKDOWN,
                message: `🃏 **Card preview** (\`${label}\`) — Level **${level > 0 ? level : 1}**`,
                attachment: [{ name: `rankup-preview-${label}.png`, stream: cardBuffer }],
              });
            }
            // Only show both variants for Discord/Messenger; Telegram has one style.
            if (native.platform === Platforms.Telegram) break;
          }
          return;
        }
      } catch {
        // Fall through to text fallback
      }
    }

    // Plain-text fallback for Facebook Page or when card API is unreachable.
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🃏 Card preview unavailable — current level is **${level > 0 ? level : 1}** (${exp} EXP).`,
    });
    return;
  }

  // ── /rankup on | off ──────────────────────────────────────────────────────
  if (sub === 'on' || sub === 'off') {
    const enabled = sub === 'on';
    const threadColl = db.threads.collection(threadID);
    if (!(await threadColl.isCollectionExist(SETTINGS_COLLECTION))) {
      await threadColl.createCollection(SETTINGS_COLLECTION);
    }
    const settings = await threadColl.getCollection(SETTINGS_COLLECTION);
    await settings.set('enabled', enabled);

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: enabled
        ? '✅ Rankup notifications enabled for this thread.'
        : '🔕 Rankup notifications disabled for this thread.',
    });
    return;
  }

  // ── /rankup (no argument) — status display ────────────────────────────────
  let current = true;
  try {
    const threadColl = db.threads.collection(threadID);
    if (await threadColl.isCollectionExist(SETTINGS_COLLECTION)) {
      const settings = await threadColl.getCollection(SETTINGS_COLLECTION);
      current = ((await settings.get('enabled')) as boolean | undefined) ?? true;
    }
  } catch { /* fail-open */ }

  const payload = {
    style: MessageStyle.MARKDOWN,
    message: [
      `Rankup notifications are currently ${current ? '✅ on' : '🔕 off'} for this thread.`,
      `Usage: \`${prefix}rankup on | off | check\``,
    ].join('\n'),
    ...(hasNativeButtons(native.platform)
      ? { button: [button.generateID({ id: BUTTON_ID.my_level })] }
      : {}),
  };

  if (event['type'] === 'button_action') {
    await chat.editMessage({
      ...payload,
      message_id_to_edit: event['messageID'] as string,
    });
  } else {
    await chat.replyMessage(payload);
  }
};