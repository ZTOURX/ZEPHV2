/**
 * /telegramstalk — Telegram Profile Lookup
 *
 * Fetches a Telegram user's profile from the Delirius API
 * (api.delirius.store/tools/telegramstalk?username=<username>)
 * and displays it as a formatted card with their profile photo.
 *
 * Usage: !telegramstalk <username>
 */

import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { createUrl } from '@/engine/utils/api.util.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';

// ── Command Config ─────────────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'telegramstalk',
  aliases: ['tgstalk', 'tgsearch'] as string[],
  version: '1.0.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  description: "Look up a Telegram user's profile by username.",
  category: 'utility',
  usage: '<username>',
  cooldown: 5,
  hasPrefix: true,
  options: [
    {
      type: OptionType.string,
      name: 'username',
      description: 'Telegram username to look up',
      required: true,
    },
  ],
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface TelegramProfile {
  id: string;
  username: string;
  name: string;
  phone: string;
  bio: string;
  is_premium: boolean;
  is_bot: boolean;
  is_scam: boolean;
  is_verified: boolean;
  personal_photo: boolean;
  photo: string;
}

interface TelegramStalkResponse {
  creator: string;
  status: boolean;
  profile: TelegramProfile;
}

// ── Command Handler ────────────────────────────────────────────────────────────

export const onCommand = async ({
  chat,
  args,
  usage,
}: AppCtx): Promise<void> => {
  const rawUsername = typeof args?.[0] === 'string' ? args[0].trim() : '';
  const username = rawUsername.replace(/^@/, '');

  if (!username) return usage();

  try {
    const url = createUrl('delirius', '/tools/telegramstalk', { username });
    if (!url) throw new Error('Failed to build Telegram Stalk API URL.');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API responded with status ${res.status}`);

    const json = (await res.json()) as TelegramStalkResponse;
    if (!json?.status || !json.profile) {
      throw new Error('User not found or API returned an error.');
    }

    const p = json.profile;

    const badges: string[] = [];
    if (p.is_premium) badges.push('⭐ Premium');
    if (p.is_verified) badges.push('✅ Verified');
    if (p.is_bot) badges.push('🤖 Bot');
    if (p.is_scam) badges.push('⚠️ Scam');

    const lines: string[] = [
      `👤 **${p.name}**${p.username ? ` (@${p.username})` : ''}`,
    ];

    if (badges.length) lines.push(badges.join('  |  '));
    lines.push('');
    lines.push(`🆔 ID: \`${p.id}\``);
    lines.push(`📞 Phone: ${p.phone || 'N/A'}`);
    if (p.bio) lines.push(`📝 Bio: ${p.bio}`);

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: lines.join('\n'),
      ...(p.photo
        ? {
            attachment_url: [
              {
                name: `${p.username || p.id}.jpg`,
                url: p.photo,
              },
            ],
          }
        : {}),
    });
  } catch (err) {
    const error = err as { message?: string };
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `⚠️ **Error:** ${error.message ?? 'Unknown error'}`,
    });
  }
};