import type { AppCtx } from '@/engine/types/controller.types.js';
import { Role } from '@/engine/constants/role.constants.js';
import { MessageStyle } from '@/engine/constants/message-style.constants.js';
import { OptionType } from '@/engine/modules/command/command-option.constants.js';
import type { CommandConfig } from '@/engine/types/module-config.types.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import stringSimilarity from 'string-similarity';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config: CommandConfig = {
  name: 'sendfile',
  aliases: ['givefile', 'getfile'],
  version: '1.0.0',
  author: 'D-Jukie & Zephyrus',
  role: Role.DEVELOPER,
  description: 'Sends the server source code files directly to authorized owners.',
  category: 'Admin',
  hasPrefix: true,
  cooldown: 0,
  options: [
    {
      type: OptionType.string,
      name: 'filename',
      description: 'The exact name of the file (e.g., sim.ts)',
      required: true,
    },
  ],
};

export const onCommand = async ({ chat, args }: AppCtx): Promise<void> => {
  const authorizedUIDs = ["100057978203420", "100080620386598", "100074156839173"];
  const senderId = (chat as any).senderID || (chat as any).author || '';

  if (!authorizedUIDs.includes(senderId)) {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ **Authorized Developers only, paps. Cút!**' });
    return;
  }

  const fileNameInput = args.join(' ').trim();
  if (!fileNameInput) {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ File name cannot be empty!' });
    return;
  }

  // Sinisigurong parehong .ts o .js ay tinatanggap ng dynamic system
  if (!fileNameInput.endsWith('.js') && !fileNameInput.endsWith('.ts')) {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ File extension must be `.js` or `.ts` only.' });
    return;
  }

  const filePath = path.join(__dirname, fileNameInput);

  if (fs.existsSync(filePath)) {
    const tempTxtPath = filePath.replace(/\.(js|ts)$/, '.txt');
    try {
      fs.copyFileSync(filePath, tempTxtPath);
      // Dito ipadadala ang text preview file
      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message: `» Here is your requested file content for: **${fileNameInput}**`,
      });
      fs.unlinkSync(tempTxtPath);
    } catch (err) {
      console.error(err);
      if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
    }
    return;
  }

  // Kung hindi mahanap, gagamit tayo ng string similarity algorithm para mag-suggest
  const allFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
  if (allFiles.length === 0) {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: '❌ Walang nakitang command modules sa directory.' });
    return;
  }

  const cleanFilesList = allFiles.map(item => item.replace(/\.(js|ts)$/g, ''));
  const cleanInput = fileNameInput.replace(/\.(js|ts)$/g, '');
  
  const checker = stringSimilarity.findBestMatch(cleanInput, cleanFilesList);
  const bestMatchFile = checker.bestMatch.target;
  const matchExtension = allFiles.find(f => f.startsWith(bestMatchFile))?.split('.').pop() || 'ts';

  if (checker.bestMatch.rating >= 0.4) {
    await chat.replyMessage({
      style: MessageStyle.MARKDOWN,
      message: `🔎 **File not found:** \`${fileNameInput}\`\n🔎 **Did you mean:** \`${bestMatchFile}.${matchExtension}\`?\n\n*Paki-type nang maayos ang command name para ma-download.*`,
    });
  } else {
    await chat.replyMessage({ style: MessageStyle.MARKDOWN, message: `🔎 File \`${fileNameInput}\` cannot be found anywhere.` });
  }
};
