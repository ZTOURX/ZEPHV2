/**
 * /video — YouTube Video Search and Streamer
 *
 * Searches YouTube for the given query, downloads the top result as an MP4
 * video file, and sends it as a playable attachment in the current chat.
 *
 * API: https://yt-dlp-stream.onrender.com/api/v2/q?=<query>
 *
 * Response shape:
 *   {
 *     credit:   string   — API provider identifier
 *     version:  string   — API version string
 *     media: {
 *       mp4:  string     — direct MP4 video download URL
 *       mp3:  string     — direct MP3 audio download URL
 *     }
 *     ApiCount: number   — total requests served by this API instance
 *     ms:       number   — server-side processing time in milliseconds
 *   }
 *
 * The command fetches the mp4 URL from the API response, streams it into a
 * buffer, and sends it as a named .mp4 attachment alongside a clean caption.
 * All network steps use AbortSignal.timeout() guards to prevent indefinite hangs.
 * Retry logic handles render.com cold-start delays gracefully.
 *
 * Aliases: /vid, /ytvid
 * Access:  ANYONE
 * Cooldown: 15s (video downloads are bandwidth-heavy)
 */

import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

// ── API constants ──────────────────────────────────────────────────────────────

const API_BASE = 'https://yt-dlp-stream.onrender.com/api/v2/q';

/**
 * Maximum wait for the metadata fetch step (ms).
 * Render.com free instances cold-start for up to ~50s; 60s gives a safe margin.
 */
const SEARCH_TIMEOUT_MS = 60_000;

/**
 * Maximum wait for the video binary download step (ms).
 * Videos can be large and render.com streams can be slow — 120s ensures
 * most clips complete even over congested connections.
 */
const DOWNLOAD_TIMEOUT_MS = 120_000;

/** How many times to retry a failed API call before giving up. */
const MAX_RETRIES = 2;

/** Base delay between retries in ms (doubles each attempt). */
const RETRY_BASE_DELAY_MS = 3_000;

// ── API response type ──────────────────────────────────────────────────────────

interface YtDlpApiResponse {
  credit: string;
  version: string;
  media: {
    mp4: string;
    mp3: string;
  };
  ApiCount: number;
  ms: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
      .substring(0, 80) + '.mp4'
  );
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * e.g. 10535 → "10.5s"
 */
function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 2_097_152 → "2.0 MB" | 512_000 → "500 KB" */
function formatBytes(bytes: number): string {
  const kb = Math.round(bytes / 1024);
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

/**
 * Fetches a URL with automatic retries on network errors and 5xx responses.
 * Uses exponential backoff between attempts to avoid hammering cold-starting services.
 */
async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  maxRetries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 3s, 6s, ...
      await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * attempt));
    }

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });

      // Only retry on server errors (5xx) — 4xx errors are caller mistakes
      if (res.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry on AbortError (timeout) — it will just time out again
      if ((err as { name?: string }).name === 'AbortError') throw err;
    }
  }

  throw lastError ?? new Error('Fetch failed after retries');
}

// ── Command configuration ──────────────────────────────────────────────────────

export const config: CommandConfig = {
  name: 'video',
  aliases: ['vid', 'ytvid'] as string[],
  version: '2.1.0',
  role: Role.ANYONE,
  author: 'AjiroDesu',
  description:
    'Search YouTube and receive the top result as a playable MP4 video file.',
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
  // Shown while the API processes the search + download — gives the user
  // immediate feedback since video fetches can take several seconds.

  const loadingId = (await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: `🔍  Searching for **${query}**...`,
  })) as string | undefined;

  // Edits the loading message to reflect current progress.
  const updateLoading = (msg: string): Promise<void> => {
    if (!loadingId) return Promise.resolve();
    return chat
      .editMessage({
        style: MessageStyle.MARKDOWN,
        message_id_to_edit: loadingId,
        message: msg,
      })
      .catch(() => {});
  };

  // Cleans up the loading indicator — silently ignored on failure.
  const dismissLoading = (): Promise<void> =>
    loadingId
      ? chat.unsendMessage(loadingId).catch(() => {})
      : Promise.resolve();

  try {
    // ── Step 1: Fetch video URLs from the search API ───────────────────────
    // The API uses an empty-key query parameter: ?=<encoded query>
    // This is the literal format required by this endpoint.

    const apiUrl = `${API_BASE}?=${encodeURIComponent(query)}`;

    let warnedColdStart = false;

    const searchRes = await fetchWithRetry(apiUrl, SEARCH_TIMEOUT_MS).catch(
      async (err) => {
        if (!warnedColdStart) {
          warnedColdStart = true;
          await updateLoading(
            `⏳  Server is warming up, please wait for **${query}**...`,
          );
        }
        throw err;
      },
    );

    if (!searchRes.ok) {
      throw new Error(
        `Search API returned HTTP ${searchRes.status} — the service may be temporarily unavailable.`,
      );
    }

    const apiData = (await searchRes.json()) as YtDlpApiResponse;

    if (!apiData.media?.mp4) {
      throw new Error(
        'No video URL was returned for this query. Try a different search term.',
      );
    }

    const { mp4: mp4Url } = apiData.media;
    const processingTime = apiData.ms ?? 0;

    // ── Step 2: Update loading message while downloading the video ─────────

    await updateLoading(`⬇️  Downloading video for **${query}**...`);

    // ── Step 3: Stream video binary into a buffer ──────────────────────────

    const videoRes = await fetchWithRetry(mp4Url, DOWNLOAD_TIMEOUT_MS);

    if (!videoRes.ok) {
      throw new Error(
        `Video download failed with HTTP ${videoRes.status}. The link may have expired — try again.`,
      );
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    if (videoBuffer.length === 0) {
      throw new Error(
        'The downloaded video file is empty. The source may no longer be available.',
      );
    }

    // ── Step 4: Dismiss loading message and send the video attachment ──────

    await dismissLoading();

    const caption = [
      `🎬  **${query}**`,
      '',
      `📦  **File Size**     ${formatBytes(videoBuffer.length)}`,
      `⚡  **Processed in**  ${formatMs(processingTime)}`,
    ].join('\n');

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: caption,
      attachment: [
        {
          name: safeFilename(query),
          stream: videoBuffer,
        },
      ],
    });
  } catch (err) {
    const error = err as { message?: string };

    // Always clean up the loading indicator on failure
    await dismissLoading();

    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: [
        `❌  **Could not retrieve video for** \`${query}\``,
        `\`${error.message ?? 'An unexpected error occurred.'}\``,
      ].join('\n'),
    });
  }
};
