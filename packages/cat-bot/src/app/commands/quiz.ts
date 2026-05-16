/**
 * /quiz — True/False Trivia Game
 *
 * Fetches a boolean True/False question from the Open Trivia Database.
 *
 * ── Coin rewards ─────────────────────────────────────────────────────────────
 * Correct answers earn coins based on difficulty:
 *   easy   → REWARD_COINS.easy   (50 coins)
 *   medium → REWARD_COINS.medium (100 coins)
 *   hard   → REWARD_COINS.hard   (200 coins)
 *
 * Coins are credited via currencies.increaseMoney() (same API as /daily).
 * A 💰 Balance button is shown alongside 🔄 Play Again on the result message
 * so the user can immediately check their updated total.
 *
 * ── Button navigation (Discord & Telegram) ───────────────────────────────────
 * Result card  →  [🔄 Play Again]  [💰 Balance]
 * Balance view →  [⬅ Back]
 * ⬅ Back restores the full result card (question + verdict + both buttons)
 * by replaying the stored result text from the balance button's context.
 *
 * ── Platform-split answer flow ───────────────────────────────────────────────
 *
 *   Discord & Telegram  → native inline buttons (✅ True | ❌ False)
 *     1. onCommand sends the question with two answer buttons.
 *     2. button.createContext() stores the answer so each onClick handler
 *        can evaluate the user's choice without re-fetching.
 *     3. On click, the message is edited in-place to reveal the result,
 *        coins are awarded (on correct), and 🔄 Play Again + 💰 Balance
 *        buttons replace the answer buttons.
 *     4. Clicking Play Again re-edits the SAME message in-place with a
 *        brand-new question (and fresh True/False buttons), preserving the
 *        same difficulty.
 *     5. A setTimeout reveals the answer if no button is pressed within
 *        TIMEOUT_MS, editing the message AND adding a 🔄 Play Again button.
 *
 *   Facebook Messenger & Facebook Page  → emoji reactions (original flow)
 *     Correct reactions also earn coins. The reply shows the earned coins and
 *     the confirmed post-credit balance (getMoney is called AFTER increaseMoney
 *     resolves so the number is always accurate).
 *
 * ── Difficulty ───────────────────────────────────────────────────────────────
 * Accepts an optional argument: easy | medium | hard. Any other value (or none)
 * selects a difficulty at random. Play Again preserves the previous difficulty.
 */

import axios from 'axios';
import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { ButtonStyle } from '@/engine/constants/button-style.constants.js';
import { Platforms } from '@/engine/modules/platform/platform.constants.js';
import { hasNativeButtons } from '@/engine/utils/ui-capabilities.util.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';

export const config: CommandConfig = {
  name: 'quiz',
  aliases: ['trivia'] as string[],
  version: '1.5.0',
  role: Role.ANYONE,
  author: 'John Lester',
  description:
    'Answer a True/False trivia question. Buttons on Discord/Telegram, reactions on Facebook. Earn coins for correct answers!',
  category: 'Games',
  usage: '[easy | medium | hard]',
  cooldown: 10,
  hasPrefix: true,
  options: [
    {
      type: OptionType.string,
      name: 'difficulty',
      description:
        'Question difficulty: easy, medium, or hard (random if omitted)',
      required: false,
    },
  ],
};

// ── Types ─────────────────────────────────────────────────────────────────────

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

const REACT = {
  TRUE: '❤',
  TRUE_DISCORD: '❤️',
  FALSE: '😢',
} as const;

/** Coins awarded for a correct answer per difficulty level. */
const REWARD_COINS: Record<Difficulty, number> = {
  easy: 50,
  medium: 100,
  hard: 200,
};

/**
 * Local IDs for every button this command registers.
 *
 * Navigation flow (Discord & Telegram):
 *
 *   [✅ True / ❌ False]  →  answer evaluated
 *   Result card           →  [🔄 play_again]  [💰 balance]
 *   Balance view          →  [⬅ back]
 *   ⬅ back               →  result card restored
 */
const BUTTON_ID = {
  true: 'true',
  false: 'false',
  playAgain: 'play_again',
  balance: 'balance',
  back: 'back',
} as const;

interface TriviaResult {
  question: string;
  correct_answer: 'True' | 'False';
  difficulty: string;
  category: string;
}

interface TriviaResponse {
  response_code: number;
  results: TriviaResult[];
}

interface ButtonQuizContext extends Record<string, unknown> {
  answer: string;
  question: string;
  messageID: string;
  difficulty: Difficulty;
  category: string;
}

/**
 * Stored inside the 💰 Balance and ⬅ Back button contexts so clicking
 * ⬅ Back can fully reconstruct the result card without re-fetching anything.
 */
interface ResultCardContext extends Record<string, unknown> {
  /** The rendered verdict paragraph (correct/wrong line + coin block). */
  resultBody: string;
  question: string;
  difficulty: Difficulty;
  category: string;
}

interface ReactQuizContext extends Record<string, unknown> {
  answer: string;
  question: string;
  messageID: string;
  difficulty: string;
  category: string;
}

// ── Module-level trackers ─────────────────────────────────────────────────────
const pendingAnswers = new Map<string, boolean>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

const TIMEOUT_MS = 20_000;

// ── Platform helper ───────────────────────────────────────────────────────────
function isButtonPlatform(platform: string): boolean {
  return platform === Platforms.Discord || platform === Platforms.Telegram;
}

// ── Result-card renderer ──────────────────────────────────────────────────────
/**
 * Edits the quiz message to show the result card with 🔄 Play Again and
 * 💰 Balance buttons. Extracted so both showButtonResult and the ⬅ Back
 * handler share identical rendering without duplicating logic.
 *
 * The full result card context is stored inside the balance button so that
 * clicking ⬅ Back can restore this card verbatim from context alone.
 */
async function renderResultCard(
  ctx: AppCtx,
  opts: {
    msgId: string;
    question: string;
    difficulty: Difficulty;
    category: string;
    resultBody: string;
  },
): Promise<void> {
  const { chat, button: btn } = ctx;
  const { msgId, question, difficulty, category, resultBody } = opts;

  // Play Again button — carries only the difficulty so runButtonQuiz can start fresh
  const playAgainId = btn.generateID({ id: BUTTON_ID.playAgain, public: true });
  btn.createContext({
    id: playAgainId,
    context: { difficulty } satisfies Record<string, unknown>,
  });

  // Balance button — carries the full card context so ⬅ Back can replay it
  const cardCtx: ResultCardContext = { resultBody, question, difficulty, category };
  const balanceId = btn.generateID({ id: BUTTON_ID.balance, public: true });
  btn.createContext({ id: balanceId, context: cardCtx });

  await chat.editMessage({
    style: MessageStyle.MARKDOWN,
    message_id_to_edit: msgId,
    message: [
      `🧠 **Trivia Quiz** — _${difficulty}_ · ${category}`,
      ``,
      question,
      ``,
      resultBody,
    ].join('\n'),
    button: [playAgainId, balanceId],
  });
}

// ── Core quiz runner (shared by onCommand and Play Again) ─────────────────────
async function runButtonQuiz(
  ctx: AppCtx,
  difficulty: Difficulty,
): Promise<void> {
  const { chat, button: btn, event } = ctx;

  // Fetch question
  let result: TriviaResult;
  try {
    const response = await axios.get<TriviaResponse>(
      `https://opentdb.com/api.php?amount=1&encode=url3986&type=boolean&difficulty=${difficulty}`,
    );
    const first = response.data.results[0];
    if (response.data.response_code !== 0 || !first) {
      throw new Error(`API response_code=${response.data.response_code}`);
    }
    result = first;
  } catch {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message:
        '❌ Could not fetch a trivia question — the server may be busy. Please try again!',
    });
    return;
  }

  const question = decodeURIComponent(result.question);
  const category = decodeURIComponent(result.category);
  const answer = result.correct_answer;
  const reward = REWARD_COINS[difficulty];

  const trueId = btn.generateID({ id: BUTTON_ID.true, public: true });
  const falseId = btn.generateID({ id: BUTTON_ID.false, public: true });

  const isFromButtonAction = event?.['type'] === 'button_action';
  let messageID: string | number | null = null;

  const questionBody = [
    `🧠 **Trivia Quiz** — _${difficulty}_ · ${category}`,
    ``,
    question,
    ``,
    `💰 Reward: **${reward} coins** for a correct answer`,
    ``,
    `_You have ${TIMEOUT_MS / 1000} seconds to answer!_`,
  ].join('\n');

  if (isFromButtonAction) {
    const currentMsgID = event['messageID'];
    if (typeof currentMsgID !== 'string' && typeof currentMsgID !== 'number') {
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: '❌ Could not restart quiz: missing message ID.',
      });
      return;
    }
    messageID = currentMsgID;
    await chat.editMessage({
      style: MessageStyle.MARKDOWN,
      message_id_to_edit: String(messageID),
      message: questionBody,
      button: [trueId, falseId],
    });
  } else {
    messageID = (await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: questionBody,
      button: [trueId, falseId],
    })) as string | number | null;
  }

  if (!messageID) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message:
        '❌ Button quiz unavailable: this platform did not return a message ID.',
    });
    return;
  }

  const msgIdStr = String(messageID);

  if (timeouts.has(msgIdStr)) {
    clearTimeout(timeouts.get(msgIdStr)!);
    timeouts.delete(msgIdStr);
  }

  pendingAnswers.set(msgIdStr, false);

  const quizCtx: ButtonQuizContext = {
    answer,
    question,
    messageID: msgIdStr,
    difficulty,
    category,
  };
  btn.createContext({ id: trueId, context: quizCtx });
  btn.createContext({ id: falseId, context: quizCtx });

  // Timeout: reveal the answer + Play Again button (no coins — unanswered)
  const timeoutHandle = setTimeout(() => {
    if (pendingAnswers.get(msgIdStr) === true) return;
    pendingAnswers.delete(msgIdStr);
    timeouts.delete(msgIdStr);

    const playAgainId = btn.generateID({ id: BUTTON_ID.playAgain, public: true });
    btn.createContext({
      id: playAgainId,
      context: { difficulty } satisfies Record<string, unknown>,
    });

    void chat.editMessage({
      style: MessageStyle.MARKDOWN,
      message_id_to_edit: msgIdStr,
      message: [
        `🧠 **Trivia Quiz** — _${difficulty}_ · ${category}`,
        ``,
        question,
        ``,
        `⏰ **Time's up!** The correct answer was **${answer}**.`,
      ].join('\n'),
      button: [playAgainId],
    });
  }, TIMEOUT_MS);

  timeouts.set(msgIdStr, timeoutHandle);
}

// ── Shared result editor (button flow) ────────────────────────────────────────
async function showButtonResult(
  ctx: AppCtx,
  userAnswer: 'True' | 'False',
): Promise<void> {
  const { event, session, button: btn, currencies } = ctx;
  const quizCtx = session.context as Partial<ButtonQuizContext>;
  const msgId = quizCtx.messageID ?? (event['messageID'] as string);
  const answer = quizCtx.answer ?? '';
  const difficulty = (quizCtx.difficulty ?? 'medium') as Difficulty;
  const question = quizCtx.question ?? '';
  const category = quizCtx.category ?? '';

  if (pendingAnswers.get(msgId) === true) return;
  pendingAnswers.set(msgId, true);

  if (timeouts.has(msgId)) {
    clearTimeout(timeouts.get(msgId)!);
    timeouts.delete(msgId);
  }

  btn.deleteContext(session.id);

  const isCorrect = userAnswer === answer;
  const reward = REWARD_COINS[difficulty];

  // ── Award coins and compose the result body ────────────────────────────────
  let resultBody: string;

  if (isCorrect) {
    const senderID = event['senderID'] as string | undefined;
    let coinBlock = '';
    if (senderID) {
      // increaseMoney must fully resolve before getMoney so the balance is accurate
      await currencies.increaseMoney({ user_id: senderID, money: reward });
      const newBalance = await currencies.getMoney(senderID);
      coinBlock = [
        ``,
        `💰 **+${reward} coins** earned!`,
        `📊 Balance: **${newBalance.toLocaleString()} coins**`,
      ].join('\n');
    }
    resultBody = `✅ **Correct!** The answer was **${answer}**. Well done! 🎉${coinBlock}`;
  } else {
    resultBody = `❌ **Wrong!** You answered **${userAnswer}**, but the correct answer was **${answer}**. 😔`;
  }

  await renderResultCard(ctx, { msgId, question, difficulty, category, resultBody });
}

// ── Button definitions ────────────────────────────────────────────────────────
export const button = {
  // ── ✅ True ─────────────────────────────────────────────────────────────────
  [BUTTON_ID.true]: {
    label: '✅ True',
    style: ButtonStyle.SUCCESS,
    onClick: async (ctx: AppCtx) => showButtonResult(ctx, 'True'),
  },

  // ── ❌ False ────────────────────────────────────────────────────────────────
  [BUTTON_ID.false]: {
    label: '❌ False',
    style: ButtonStyle.DANGER,
    onClick: async (ctx: AppCtx) => showButtonResult(ctx, 'False'),
  },

  // ── 🔄 Play Again ───────────────────────────────────────────────────────────
  [BUTTON_ID.playAgain]: {
    label: '🔄 Play Again',
    style: ButtonStyle.PRIMARY,
    onClick: async (ctx: AppCtx) => {
      const { button: btn, session } = ctx;

      const storedDifficulty = session.context['difficulty'] as Difficulty | undefined;
      const difficulty: Difficulty =
        storedDifficulty && (DIFFICULTIES as readonly string[]).includes(storedDifficulty)
          ? storedDifficulty
          : (DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)] ?? 'medium');

      btn.deleteContext(session.id);
      await runButtonQuiz(ctx, difficulty);
    },
  },

  // ── 💰 Balance ──────────────────────────────────────────────────────────────
  // Switches the card to a balance view. The full ResultCardContext is forwarded
  // into the ⬅ Back button so clicking Back restores the result card exactly.
  [BUTTON_ID.balance]: {
    label: '💰 Balance',
    style: ButtonStyle.SECONDARY,
    onClick: async (ctx: AppCtx) => {
      const { chat, event, currencies, button: btn, session } = ctx;

      const senderID = event['senderID'] as string | undefined;
      const msgId = event['messageID'] as string | undefined;

      // Carry the result card context into the ⬅ Back button before clearing it
      const cardCtx = session.context as Partial<ResultCardContext>;
      btn.deleteContext(session.id);

      if (!senderID || !msgId) {
        await chat.editMessage({
          style: MessageStyle.MARKDOWN,
          message_id_to_edit: msgId ?? '',
          message: '❌ Could not identify your user ID on this platform.',
        });
        return;
      }

      const coins = await currencies.getMoney(senderID);

      // ⬅ Back button restores the result card using the forwarded context
      const backId = btn.generateID({ id: BUTTON_ID.back, public: true });
      btn.createContext({ id: backId, context: cardCtx as Record<string, unknown> });

      await chat.editMessage({
        style: MessageStyle.MARKDOWN,
        message_id_to_edit: msgId,
        message: [
          `💰 **Coin Balance**`,
          ``,
          `📊 Current balance: **${coins.toLocaleString()} coins**`,
        ].join('\n'),
        button: [backId],
      });
    },
  },

  // ── ⬅ Back ──────────────────────────────────────────────────────────────────
  // Restores the quiz result card from the context stored by the balance button.
  // No network calls — everything is in ResultCardContext.
  [BUTTON_ID.back]: {
    label: '⬅ Back',
    style: ButtonStyle.SECONDARY,
    onClick: async (ctx: AppCtx) => {
      const { event, session, button: btn, chat } = ctx;

      const cardCtx = session.context as Partial<ResultCardContext>;
      const msgId = event['messageID'] as string | undefined;

      btn.deleteContext(session.id);

      if (
        !msgId ||
        !cardCtx.resultBody ||
        !cardCtx.question ||
        !cardCtx.difficulty ||
        !cardCtx.category
      ) {
        await chat.editMessage({
          style: MessageStyle.MARKDOWN,
          message_id_to_edit: msgId ?? '',
          message: '❌ Could not restore the result — please run `/quiz` again.',
        });
        return;
      }

      await renderResultCard(ctx, {
        msgId,
        question: cardCtx.question,
        difficulty: cardCtx.difficulty,
        category: cardCtx.category,
        resultBody: cardCtx.resultBody,
      });
    },
  },
};

// ── Command entry point ───────────────────────────────────────────────────────
export const onCommand = async ({
  chat,
  state,
  args,
  native,
  button: btn,
}: AppCtx): Promise<void> => {
  const rawArg = (args[0] ?? '').toLowerCase();
  const difficulty: Difficulty = (DIFFICULTIES as readonly string[]).includes(rawArg)
    ? (rawArg as Difficulty)
    : (DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)] ?? 'medium');

  // ════════════════════════════════════════════════════════════════════════════
  // BRANCH A — Discord & Telegram: native inline buttons
  // ════════════════════════════════════════════════════════════════════════════
  if (isButtonPlatform(native.platform)) {
    await runButtonQuiz({ chat, state, native, button: btn } as AppCtx, difficulty);
    return;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BRANCH B — Facebook Messenger & Facebook Page: emoji reaction flow
  // ════════════════════════════════════════════════════════════════════════════

  let result: TriviaResult;
  try {
    const response = await axios.get<TriviaResponse>(
      `https://opentdb.com/api.php?amount=1&encode=url3986&type=boolean&difficulty=${difficulty}`,
    );
    const first = response.data.results[0];
    if (response.data.response_code !== 0 || !first) {
      throw new Error(`API response_code=${response.data.response_code}`);
    }
    result = first;
  } catch {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message:
        '❌ Could not fetch a trivia question — the server may be busy. Please try again!',
    });
    return;
  }

  const question = decodeURIComponent(result.question);
  const category = decodeURIComponent(result.category);
  const answer = result.correct_answer;
  const reward = REWARD_COINS[difficulty];

  const messageID = await chat.replyMessage({
    style: MessageStyle.MARKDOWN,
    message: [
      `🧠 **Trivia Quiz** — _${difficulty}_ · ${category}`,
      ``,
      question,
      ``,
      `💰 Reward: **${reward} coins** for a correct answer`,
      ``,
      `❤️ → **True**   |   😢 → **False**`,
      `_You have ${TIMEOUT_MS / 1000} seconds to react!_`,
    ].join('\n'),
  });

  if (!messageID) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message:
        '❌ onReact unavailable: this platform did not return a message ID from chat.replyMessage().',
    });
    return;
  }

  const msgIdStr = String(messageID);
  pendingAnswers.set(msgIdStr, false);

  state.create({
    id: state.generateID({ id: msgIdStr }),
    state: [REACT.TRUE, REACT.TRUE_DISCORD, REACT.FALSE],
    context: {
      answer,
      question,
      messageID: msgIdStr,
      difficulty,
      category,
    } satisfies ReactQuizContext,
  });

  setTimeout(() => {
    const alreadyAnswered = pendingAnswers.get(msgIdStr) ?? false;
    pendingAnswers.delete(msgIdStr);
    if (!alreadyAnswered) {
      void chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `⏰ **Time's up!** The correct answer was **${answer}**.`,
      });
    }
  }, TIMEOUT_MS);
};

// ── Shared reaction evaluator (FB flow) ───────────────────────────────────────
async function handleReact(
  { chat, session, state, event, currencies }: AppCtx,
  userAnswer: 'True' | 'False',
): Promise<void> {
  const ctx = session.context as Partial<ReactQuizContext>;
  const msgId = ctx.messageID ?? '';
  const correctAnswer = ctx.answer ?? '';
  const difficulty = (ctx.difficulty ?? 'medium') as Difficulty;
  const reward = REWARD_COINS[difficulty];

  pendingAnswers.set(msgId, true);
  state.delete(session.id);

  const isCorrect = userAnswer === correctAnswer;

  if (isCorrect) {
    const senderID = event['senderID'] as string | undefined;
    let coinBlock = '';

    if (senderID) {
      // Await the credit first — getMoney called after so the balance is accurate
      await currencies.increaseMoney({ user_id: senderID, money: reward });
      const newBalance = await currencies.getMoney(senderID);
      coinBlock = [
        ``,
        `💰 **+${reward} coins** earned!`,
        `📊 Balance: **${newBalance.toLocaleString()} coins**`,
      ].join('\n');
    }

    await chat.reply({
      style: MessageStyle.MARKDOWN,
      message: `✅ **Correct!** The answer was **${correctAnswer}**. Well done! 🎉${coinBlock}`,
    });
  } else {
    await chat.reply({
      style: MessageStyle.MARKDOWN,
      message: `❌ **Wrong!** You answered **${userAnswer}**, but the correct answer was **${correctAnswer}**. 😔`,
    });
  }
}

// ── Reaction handlers (FB Messenger & FB Page only) ───────────────────────────
export const onReact = {
  /** ❤  (U+2764)       — "True" on FB Messenger & FB Page */
  [REACT.TRUE]: async (ctx: AppCtx) => handleReact(ctx, 'True'),
  /** ❤️ (U+2764+FE0F)  — "True" on Discord (Variation Selector-16 appended) */
  [REACT.TRUE_DISCORD]: async (ctx: AppCtx) => handleReact(ctx, 'True'),
  /** 😢                — "False" on all platforms */
  [REACT.FALSE]: async (ctx: AppCtx) => handleReact(ctx, 'False'),
};