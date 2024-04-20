import NodeCron from 'node-cron';
import { ChatUserstate } from 'tmi.js';
import { ICommand } from '@pezi-bot/shared';

import { CONFIG, SEQUELIZE_DB_CONFIG, SEQUELIZE_LOG_CONFIG } from './Config';
import { TwitchClient } from './Bot';

import { Command } from '../models/Command';
import { Cron } from '../models/Cron';
import { User } from '../models/User';
import { Log } from '../models/Log';

import { AdminCommand } from '../commands/Admin';
import { CmdCommand } from '../commands/Cmd';
import { DiceCommand } from '../commands/Dice';
import { FlipCommand } from '../commands/Flip';
import { MessageCommand } from '../commands/Message';
import { NoteCommand } from '../commands/Note';
import { PointsCommand } from '../commands/Points';
import { RaffleCommand } from '../commands/Raffle';
import { SlotCommand } from '../commands/Slot';
import { StatsCommand } from '../commands/Stats';
import { TriviaCommand } from '../commands/Trivia';

import { RewardCron } from '../crons/Rewards';
import { RaffleCron } from '../crons/Raffle';
import { StatusCron } from '../crons/Status';
import { TriviaCron } from '../crons/Trivia';

export type DbConnection = { Command: typeof Command; Cron: typeof Cron; User: typeof User; Log: typeof Log };
export abstract class App {
  private static isStarted = false;
  private static isDbSynced = false;
  private static isBotStarted = false;
  private static isCronStarted = false;

  static db: DbConnection = { Command, Cron, User, Log };
  static bot: TwitchClient = new TwitchClient({ identity: CONFIG, channels: [CONFIG.streamer] }, CONFIG);

  static async start() {
    if (App.isStarted) return true;
    App.isStarted = true;

    await App.loadDb();
    await App.loadBot();
    await App.loadCrons();

    return App.isStarted;
  }

  static async loadDb() {
    if (App.isDbSynced) return App.db;
    App.isDbSynced = true;

    await Promise.all([SEQUELIZE_DB_CONFIG.sync(), SEQUELIZE_LOG_CONFIG.sync]);
    const [cronsCount, commandsCount] = await Promise.all([Cron.count(), Command.count()]);

    const commands = [
      AdminCommand.defaultConfig,
      CmdCommand.defaultConfig,
      DiceCommand.defaultConfig,
      FlipCommand.defaultConfig,
      MessageCommand.defaultConfig,
      NoteCommand.defaultConfig,
      PointsCommand.defaultConfig,
      RaffleCommand.defaultConfig,
      SlotCommand.defaultConfig,
      StatsCommand.defaultConfig,
      TriviaCommand.defaultConfig,
    ];

    const crons = [
      RaffleCron.defaultConfig,
      RewardCron.defaultConfig,
      StatusCron.defaultConfig,
      TriviaCron.defaultConfig,
    ];

    const promises = [];
    if (cronsCount === 0) promises.push(Cron.bulkCreate(crons));
    if (commandsCount === 0) promises.push(Command.bulkCreate(commands));
    await Promise.all(promises);

    return App.db;
  }

  static async loadBot() {
    if (App.isBotStarted) return App.bot;
    App.isBotStarted = true;

    await App.bot.start();

    App.bot.on('message', async (_, userstate: ChatUserstate, message: string): Promise<boolean> => {
      try {
        const params = message.split(' ');
        const commandName = params.shift();

        if (!User.isValidUserState(userstate)) return false;

        const [user, command] = await Promise.all([
          User.fetch(userstate),
          Command.findOne({ where: { name: commandName } }),
        ]);
        await user.addAsChatter();

        if (!command) return false;

        const userCanExecute = await command.canUserExecute(user, App.bot);
        if (!userCanExecute) return false;

        const isExecutedSuccesfully = await App.execute(command, user, params, App.bot);
        if (isExecutedSuccesfully) await command.addCooldowns(user);

        return true;
      } catch (ex) {
        console.log(`There was an error while trying to execute "${message}"`);
        console.log(ex);

        return false;
      }
    });

    return App.bot;
  }

  static async loadCrons() {
    if (App.isCronStarted) return App.isCronStarted;
    App.isCronStarted = true;

    await Cron.resetExecution();
    const cronJobs = [StatusCron, RewardCron, TriviaCron, RaffleCron];
    NodeCron.schedule(
      `*/1 * * * * *`,
      async () => await Promise.all(cronJobs.map((cronJob) => cronJob.execute(App.bot)))
    );

    return App.isCronStarted;
  }

  static async execute(command: Command<ICommand>, user: User, params: string[], bot: TwitchClient): Promise<boolean> {
    if (AdminCommand.isValid(command)) return await AdminCommand.execute(user, params, command, bot);
    if (CmdCommand.isValid(command)) return await CmdCommand.execute(user, params, command, bot);
    if (DiceCommand.isValid(command)) return await DiceCommand.execute(user, params, command, bot);
    if (FlipCommand.isValid(command)) return await FlipCommand.execute(user, params, command, bot);
    if (MessageCommand.isValid(command)) return await MessageCommand.execute(user, params, command, bot);
    if (NoteCommand.isValid(command)) return await NoteCommand.execute(user, params, command, bot);
    if (PointsCommand.isValid(command)) return await PointsCommand.execute(user, params, command, bot);
    if (RaffleCommand.isValid(command)) return await RaffleCommand.execute(user, params, command, bot);
    if (SlotCommand.isValid(command)) return await SlotCommand.execute(user, params, command, bot);
    if (StatsCommand.isValid(command)) return await StatsCommand.execute(user, params, command, bot);
    if (TriviaCommand.isValid(command)) return await TriviaCommand.execute(user, params, command, bot);
    return false;
  }
}
