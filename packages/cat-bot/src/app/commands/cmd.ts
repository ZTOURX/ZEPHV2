import type { AppCtx } from '@/engine/types/controller.types.js'
import { Role } from '@/engine/constants/role.constants.js'
import { MessageStyle } from '@/engine/constants/message-style.constants.js'
import type { CommandConfig } from '@/engine/types/module-config.types.js'

export const config: CommandConfig = {
  name: 'cmd',
  version: '1.0.0',
  role: Role.BOT_ADMIN,
  author: 'Mirai Team',
  description: 'Manage/control bot modules',
  usage: '[load/unload/loadAll/unloadAll/info/count] [module name]',
  cooldown: 5,
  hasPrefix: true,
}

// NOTE — load / unload / loadAll / unloadAll:
//   These operations hot-reload command modules at runtime by manipulating
//   require.cache and global.client.commands. Cat Bot has no documented ctx
//   API for that. These sub-commands reply with an explicit unsupported notice.
//
// NOTE — count:
//   The original read global.client.commands.size. Cat Bot exposes no runtime
//   command registry via ctx. Unsupported — same notice.
//
// NOTE — info:
//   The original looked up any command by name via global.client.commands.get().
//   Cat Bot exposes no such registry via ctx. We can only surface this
//   command's own config. Documented below.

export const onCommand = async ({ chat, args, usage }: AppCtx): Promise<void> => {
  const sub = args[0]

  switch (sub) {
    case 'count':
    case 'load':
    case 'unload':
    case 'loadAll':
    case 'unloadAll': {
      await chat.replyMessage({
        style: MessageStyle.TEXT,
        message:
          `⚠️ "${sub}" is not supported in Cat Bot.\n` +
          `Cat Bot does not expose a runtime module registry or hot-reload API via ctx.`,
      })
      break
    }

    case 'info': {
      const moduleName = args.slice(1).join(' ').trim()
      if (!moduleName) {
        await chat.replyMessage({
          style: MessageStyle.TEXT,
          message: 'Module name cannot be empty!',
        })
        return
      }

      // Cat Bot provides no ctx API to look up another command's config by name.
      if (moduleName !== config.name) {
        await chat.replyMessage({
          style: MessageStyle.TEXT,
          message:
            `⚠️ Cannot look up info for "${moduleName}" — Cat Bot does not expose a runtime command registry via ctx.\n` +
            `Only this command's own config is shown below:`,
        })
      }

      const roleLabel =
        config.role === Role.ANYONE ? 'Anyone'
        : config.role === Role.THREAD_ADMIN ? 'Thread Admin'
        : config.role === Role.PREMIUM ? 'Premium'
        : config.role === Role.BOT_ADMIN ? 'Bot Admin'
        : 'System Admin'

      await chat.replyMessage({
        style: MessageStyle.MARKDOWN,
        message:
          `=== ${config.name.toUpperCase()} ===\n` +
          `- **Author:** ${config.author}\n` +
          `- **Version:** ${config.version}\n` +
          `- **Required role:** ${roleLabel}\n` +
          `- **Cooldown:** ${config.cooldown}s\n` +
          `- **Description:** ${config.description}`,
      })
      break
    }

    default: {
      await usage()
      break
    }
  }
}
