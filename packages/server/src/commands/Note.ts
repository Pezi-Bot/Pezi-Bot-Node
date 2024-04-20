import { INoteCommand, isNoteCommand } from '@pezi-bot/shared';

import { MessageCommand } from './Message';
import { Command } from '../models/Command';
import { CommandActionType } from '../types/Command';

export const NoteCommand: CommandActionType<INoteCommand> = {
  defaultConfig: {
    name: '!note',
    type: 'NOTE',
    cost: 0,
    customCost: false,
    userCd: 0,
    globalCd: 0,
    cdMessage: '$user You can use $command after $cd seconds!',
    showCdMessage: true,
    isEnabled: true,
    onlyOnline: false,
    permission: ['streamer', 'admin', 'mod'],
    lastCalledAt: new Date(0),
    isLogEnabled: false,
    opts: {
      messages: {
        add: '$user added the command $command - $message',
        set: '$user set the command $command - $message',
        remove: '$user removed the command $command - $message',
        enable: '$user enabled the command $command - $message',
        disable: '$user disabled the command $command - $message',
        userCd: '$user changed the user CD $command to $cd seconds',
        globalCd: '$user changed the global CD $command to $cd seconds',
      },
    },
  },
  isValid: (command): command is Command<INoteCommand> => isNoteCommand(command),
  execute: async (user, params, command, bot) => {
    const modifier = params.shift();
    const name = params.shift();
    const value = params.join(' ');

    const cd = Number(value) ? Math.abs(Number(value)) : NaN;

    let message;
    let cmd = await Command.findOne({ where: { name } });

    if (modifier === 'add' && !cmd && name) cmd = await Command.createNewMessage(name, value);

    if (!cmd || !MessageCommand.isValid(cmd)) return false;

    switch (modifier) {
      case 'add':
        message = command.opts.messages.add;
        break;
      case 'remove':
        message = command.opts.messages.remove;
        await cmd.destroy();
        break;
      case 'enable':
        message = command.opts.messages.enable;
        await cmd.update({ isEnabled: true });
        break;
      case 'disable':
        message = command.opts.messages.disable;
        await cmd.update({ isEnabled: false });
        break;
      case 'ucd':
        message = command.opts.messages.userCd;
        await cmd.update({ userCd: cd });
        break;
      case 'gcd':
        message = command.opts.messages.globalCd;
        await cmd.update({ globalCd: cd });
        break;
      case 'set':
        message = command.opts.messages.set;
        cmd.opts.message = value;
        cmd.changed('opts', true);
        await cmd.save();
        break;
      default:
        return false;
    }

    message = message
      .replaceAll('$user', user.username)
      .replaceAll('$command', cmd.name)
      .replaceAll('$message', cmd.opts.message)
      .replaceAll('$cd', cd.toString());

    await bot.send(message);
    return true;
  },
};
