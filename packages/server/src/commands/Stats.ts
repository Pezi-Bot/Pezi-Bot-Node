import { Op } from '@sequelize/core';
import { IStatsCommand, isStatsCommand } from '@pezi-bot/shared';

import { CONFIG } from '../utils/Config';
import { Log } from '../models/Log';
import { Command } from '../models/Command';
import { CommandActionType } from '../types/Command';

export const StatsCommand: CommandActionType<IStatsCommand> = {
  defaultConfig: {
    name: '!stats',
    type: 'STATS',
    cost: 0,
    customCost: false,
    userCd: 60,
    globalCd: 0,
    cdMessage: '$user You can use $command after $cd seconds!',
    showCdMessage: true,
    isEnabled: true,
    onlyOnline: false,
    permission: ['streamer', 'admin', 'mod', 'sub', 'vip', 'member'],
    lastCalledAt: new Date(0),
    isLogEnabled: false,
    opts: {
      messages: {
        positive: '$user with all your stakes of $stake $currency you are ahead with $profit $currency SeemsGood',
        negative: '$user with all your stakes of $stake $currency you are behind with $profit $currency LUL',
      },
    },
  },
  isValid: (command): command is Command<IStatsCommand> => isStatsCommand(command),
  execute: async (user, _, command, bot) => {
    const userId = user.userId;
    const currencyName = CONFIG.currencyName;
    const logs = await Log.findAll({ where: { userId, type: { [Op.ne]: 'REWARDS' } } });

    const stake = logs.reduce((sum, log) => sum + log.cost, 0);
    const profit = logs.reduce((sum, log) => sum + log.points, 0);

    const isPositive = profit >= 0;

    let message = isPositive ? command.opts.messages.positive : command.opts.messages.negative;
    message = message
      .replaceAll('$user', user.username)
      .replaceAll('$stake', Math.abs(stake).toString())
      .replaceAll('$profit', profit.toString())
      .replaceAll('$currency', currencyName);

    await bot.send(message);

    return true;
  },
};
