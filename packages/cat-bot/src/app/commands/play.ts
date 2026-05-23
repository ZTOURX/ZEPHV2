/**
 * /play — YouTube Audio Search and Streamer
 *
 * Searches YouTube for the given query, downloads the top result as an MP3
 * audio file, and sends it as a playable attachment in the current chat.
 *
 * API: https://yt-dlp-stream.onrender.com/api/v2/q?=<query>
 *
 * Response shape:
 *   {
 *     credit:   string   — API provider identifier ("MJL")
 *     version:  string   — API version string ("1.2.2")
 *     media: {
 *       mp4:  string     — direct MP4 video download URL
 *       mp3:  string     — direct MP3 audio download URL
 *     }
 *     ApiCount: number   — total requests served by this API instance
 *     ms:       number   — server-side processing time in milliseconds
 *   }
 *
 * Aliases: /song, /music
 * Access:  ANYONE
 * Cooldown: 15s (audio downloads are bandwidth-heavy)
 */

import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// ── API constants ──────────────────────────────────────────────────────────────

const API_BASE = 'https://yt-dlp-stream.onrender.com/api/v2/q';

/** Maximum wait for the metadata fetch step (ms). */
const SEARCH_TIMEOUT_MS = 30_000;

/** Maximum wait for the audio binary download step (ms). */
const DOWNLOAD_TIMEOUT_MS = 60_000;

// ── API response type ──────────────────────────────────────────────────────────
// Matches the exact shape returned by the API (verified against live response)

interface YtDlpApiResponse {
  credit: string;    // e.g. "MJL"
  version: string;   // e.g. "1.2.2"
  media: {
    mp4: string;     // Direct MP4 video download URL
    mp3: string;     // Direct MP3 audio download URL
  };
  ApiCount: number;  // Total requests served by this API instance
  ms: number;        // Server-side processing time in milliseconds
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strips characters that are unsafe in filenames across all major OSes.
 * Truncates to 80 characters to avoid path-length limits.
 */
function safeFilename(query: string): string {
  return (
    query
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .trim()
      .substring(0, 80) + '.mp3'
  );
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * e.g. 10535 → "10.5s" | 800 → "800ms"
 */
function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Formats a byte count into a human-readable file size label.
 * e.g. 2_097_152 → "2.0 MB" | 512_000 → "500 KB"
 */
function formatBytes(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

// ── Command configuration ──────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'play',
  aliases: ['song', 'music'] as string[],
  version: '2.0.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  description:
    'Search YouTube and receive the top result as a playable MP3 audio file.',
  category: 'Media',
  usage: '<search query>',
  cooldown: 15,
  hasPrefix: true,
};

// ── Command handler ────────────────────────────────────────────────────────────

export const onCommand = async ({
  chat,
  args,
  usage,
}: AppCtx): Promise<void> => {
  // ── Input validation ───────────────────────────────────────────────────────

  if (args.length === 0) {
    await usage();
    return;
  }

  const query = args.join(' ').trim();

  // ── Loading indicator ──────────────────────────────────────────────────────

  const loadingId = (await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: `🔍  Searching for **${query}**...`,
  })) as string | undefined;

  try {
    // ── Step 1: Fetch audio URLs from the search API ───────────────────────
    // NOTE: The endpoint uses a valueless key — the literal format is `?=<query>`.
    // Example: /api/v2/q?=never+gonna+give+you+up

    const apiUrl = `${API_BASE}?=${encodeURIComponent(query)}`;

    const searchRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    if (!searchRes.ok) {
      throw new Error(
        `Search API returned HTTP ${searchRes.status} — the service may be temporarily unavailable.`,
      );
    }

    const apiData = (await searchRes.json()) as YtDlpApiResponse;

    // Guard: both URLs must be present
    if (!apiData.media?.mp3 || !apiData.media?.mp4) {
      throw new Error(
        'No media URLs were returned for this query. Try a different search term.',
      );
    }

    const { mp3: mp3Url, mp4: mp4Url } = apiData.media;
    const serverMs = apiData.ms ?? 0;

    // ── Step 2: Update loading message while downloading the audio ─────────

    if (loadingId) {
      await chat.editMessage({
        style: MessageStyle.MARKDOWN,
        message_id_to_edit: loadingId,
        message: `⬇️  Downloading audio for **${query}**...`,
      });
    }

    // ── Step 3: Stream audio binary into a buffer ──────────────────────────

    const audioRes = await fetch(mp3Url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    if (!audioRes.ok) {
      throw new Error(
        `Audio download failed with HTTP ${audioRes.status}. The link may have expired — try again.`,
      );
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    if (audioBuffer.length === 0) {
      throw new Error(
        'The downloaded audio file is empty. The source may no longer be available.',
      );
    }

    // ── Step 4: Dismiss loading message and send the audio attachment ──────

    if (loadingId) {
      await chat.unsendMessage(loadingId).catch(() => {
        // Ignore — message may already be deleted or unsend is unsupported
      });
    }

    const caption = [
      `🎵  **${query}**`,
      '',
      `📦  **File Size**     ${formatBytes(audioBuffer.length)}`,
      `⚡  **API Response**  ${formatMs(serverMs)}`,
      `🎬  **Video**         ${mp4Url}`,
    ].join('\n');

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: caption,
      attachment: [
        {
          name: safeFilename(query),
          stream: audioBuffer,
        },
      ],
    });
  } catch (err) {
    const error = err as { message?: string };

    // Always clean up the loading indicator on failure
    if (loadingId) {
      await chat.unsendMessage(loadingId).catch(() => {});
    }

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: [
        `❌  **Could not retrieve audio for** \`${query}\``,
        `\`${error.message ?? 'An unexpected error occurred.'}\``,
      ].join('\n'),
    });
  }
};