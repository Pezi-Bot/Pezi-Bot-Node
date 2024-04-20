import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  ModelAttributes,
  WhereAttributeHashValue,
} from '@sequelize/core';
import { PartialBy } from '@sequelize/core/types/utils/types';
import { CommandType, ICommand, IMessageCommand, StatusCronType, UserRoleType } from '@pezi-bot/shared';

import { Cron } from './Cron';
import { User } from './User';
import { TwitchClient } from '../utils/Bot';
import { SEQUELIZE_DB_CONFIG } from '../utils/Config';

type CommandAttributes = Command<ICommand>;
export class Command<T extends ICommand>
  extends Model<InferAttributes<CommandAttributes>, InferCreationAttributes<CommandAttributes>>
  implements CommandType<T>
{
  declare id: CreationOptional<number>;
  declare type: T['type'];
  declare name: string;
  declare cost: number;
  declare customCost: boolean;
  declare userCd: number;
  declare globalCd: number;
  declare cdMessage: string;
  declare showCdMessage: boolean;
  declare isEnabled: boolean;
  declare onlyOnline: boolean;
  declare lastCalledAt: Date;
  declare permission: UserRoleType[];
  declare isLogEnabled: boolean;
  declare opts: T['opts'];

  static defaultAttributes: ModelAttributes<
    Command<ICommand>,
    PartialBy<InferAttributes<Command<ICommand>, { omit: never }>, never>
  > = {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.TEXT, allowNull: false },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false },
    isLogEnabled: { type: DataTypes.BOOLEAN, allowNull: false },
    lastCalledAt: { type: DataTypes.DATE, allowNull: false },
    opts: { type: DataTypes.JSON, allowNull: false },
    cost: { type: DataTypes.INTEGER, allowNull: false },
    customCost: { type: DataTypes.BOOLEAN, allowNull: false },
    userCd: { type: DataTypes.INTEGER, allowNull: false },
    globalCd: { type: DataTypes.INTEGER, allowNull: false },
    cdMessage: { type: DataTypes.TEXT, allowNull: false },
    showCdMessage: { type: DataTypes.BOOLEAN, allowNull: false },
    onlyOnline: { type: DataTypes.BOOLEAN, allowNull: false },
    permission: { type: DataTypes.JSON, allowNull: false },
  };

  static async fetch<T extends ICommand>(type: WhereAttributeHashValue<T['type']>): Promise<Command<T>> {
    const command = await Command.findOne<Command<T>>({ where: { type } });
    if (!command) throw Error(`Command ${type} missing from the database!`);
    return command;
  }

  async canUserExecute(user: User, bot: TwitchClient): Promise<boolean> {
    const command = this;
    const currentTime = new Date();

    const cronStatus = await Cron.fetch<StatusCronType>('STATUS');

    const userRoleType = user.getRoleType();
    const isStreamOnline = cronStatus.opts.isOnline;

    const userCd = command.userCd;
    const globalCd = command.globalCd;
    const userLastCallTimeStr = user.commands[command.type];

    const userLastCallTime = userLastCallTimeStr ? new Date(userLastCallTimeStr) : new Date(0);
    const globalLastCallTime = command.lastCalledAt ?? new Date(0);

    const userTime = (currentTime.getTime() - userLastCallTime.getTime()) / 1000;
    const globalTime = (currentTime.getTime() - globalLastCallTime.getTime()) / 1000;

    const isUserTimeAvailable = userTime >= userCd;
    const isGlobalTimeAvailable = globalTime >= globalCd;

    const isUserPermitted = command.permission.includes(userRoleType);
    const isCommandEnabled = command.isEnabled && ((isStreamOnline && command.onlyOnline) || !command.onlyOnline);
    const isCdTimeAvailable = isUserTimeAvailable && isGlobalTimeAvailable;

    if (isCommandEnabled && isUserPermitted && !isCdTimeAvailable && command.showCdMessage) {
      const cd = (userCd - userTime).toFixed(0);
      const message = command.cdMessage
        .replaceAll('$cd', cd)
        .replaceAll('$command', command.name)
        .replaceAll('$user', user.username);

      await bot.send(message);
    }

    const isCommandExecutable = isCommandEnabled && isUserPermitted && isCdTimeAvailable;
    return isCommandExecutable;
  }

  async addCooldowns(user: User): Promise<void> {
    const command = this;
    const currentTime = new Date();

    command.lastCalledAt = currentTime;
    user.commands[command.type] = currentTime.toISOString();
    user.changed('commands', true);

    await Promise.all([user.save(), command.save()]);
  }

  getCost(customCost: string, user: User): number {
    const command = this;
    if (!command.customCost) return command.cost;
    if (customCost === 'all') return user.points;
    if (Number(customCost)) return Math.abs(Math.floor(Number(customCost)));
    return command.cost;
  }

  static async createNewMessage(name: string, message: string): Promise<Command<IMessageCommand>> {
    const command = await Command.create<Command<IMessageCommand>>({
      name: name,
      type: 'MESSAGE',
      cost: 0,
      customCost: false,
      userCd: 0,
      globalCd: 0,
      cdMessage: '$user You can use $command after $cd seconds!',
      showCdMessage: true,
      isEnabled: true,
      onlyOnline: false,
      permission: ['streamer', 'admin', 'mod', 'sub', 'vip', 'member'],
      lastCalledAt: new Date(0),
      isLogEnabled: false,
      opts: { message },
    });

    return command;
  }
}

Command.init(Command.defaultAttributes, { sequelize: SEQUELIZE_DB_CONFIG });
