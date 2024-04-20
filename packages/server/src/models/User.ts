import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  ModelAttributes,
} from '@sequelize/core';
import { ChatUserstate } from 'tmi.js';
import { PartialBy } from '@sequelize/core/types/utils/types';
import { RewardCronType, UserRoleType, UserType } from '@pezi-bot/shared';

import { Cron } from './Cron';
import { Log } from './Log';
import { ValidUserState } from '../types/User';
import { CONFIG, SEQUELIZE_DB_CONFIG } from '../utils/Config';

type UserAttributes = User;
export class User
  extends Model<InferAttributes<UserAttributes>, InferCreationAttributes<UserAttributes>>
  implements UserType
{
  declare id: CreationOptional<number>;
  declare userId: string;
  declare username: string;
  declare points: number;
  declare color?: string;
  declare isSub: boolean;
  declare isVIP: boolean;
  declare isMod: boolean;
  declare isAdmin: boolean;
  declare isStreamer: boolean;
  declare commands: { [key: string]: string };

  static defaultAttributes: ModelAttributes<User, PartialBy<InferAttributes<User, { omit: never }>, never>> = {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.TEXT, allowNull: false },
    username: { type: DataTypes.TEXT, allowNull: false },
    points: { type: DataTypes.INTEGER, allowNull: false },
    color: { type: DataTypes.TEXT, allowNull: true },
    isSub: { type: DataTypes.BOOLEAN, allowNull: false },
    isVIP: { type: DataTypes.BOOLEAN, allowNull: false },
    isMod: { type: DataTypes.BOOLEAN, allowNull: false },
    isAdmin: { type: DataTypes.BOOLEAN, allowNull: false },
    isStreamer: { type: DataTypes.BOOLEAN, allowNull: false },
    commands: { type: DataTypes.JSON, allowNull: false },
  };
  static isValidUserState = (account: ChatUserstate): account is ValidUserState => 'display-name' in account;

  static getUserFromAcc = (userstate: ValidUserState): UserType => {
    const user = {
      userId: userstate['username'],
      username: userstate['display-name'],
      points: CONFIG.defaultPoints,
      color: userstate['color'],
      isVIP: !!userstate['badges']?.vip,
      isMod: !!userstate['badges']?.moderator,
      isSub: !!userstate['subscriber'],
      isStreamer: !!userstate['badges']?.broadcaster,
      isAdmin: !!userstate['badges']?.broadcaster,
      commands: {},
    };

    return user;
  };

  static async fetch(userstate: ValidUserState): Promise<User> {
    const newUser = User.getUserFromAcc(userstate);
    const oldUser = await User.findOne({ where: { userId: newUser.userId } });

    if (!oldUser) {
      const user = await User.create(newUser);
      return user;
    }

    if (
      newUser.username !== oldUser.username ||
      newUser.color !== oldUser.color ||
      newUser.isStreamer !== oldUser.isStreamer ||
      newUser.isMod !== oldUser.isMod ||
      newUser.isSub !== oldUser.isSub ||
      newUser.isVIP !== oldUser.isVIP
    ) {
      oldUser.username = newUser.username;
      oldUser.color = newUser.color;
      oldUser.isStreamer = newUser.isStreamer;
      oldUser.isMod = newUser.isMod;
      oldUser.isSub = newUser.isSub;
      oldUser.isVIP = newUser.isVIP;
      await oldUser.save();
    }

    return oldUser;
  }

  static async reset() {
    await User.update({ points: 0, commands: {} }, { where: {} });
    return true;
  }

  async addAsChatter(): Promise<boolean> {
    const cronRewards = await Cron.fetch<RewardCronType>('REWARDS');

    const isChatter = cronRewards.opts.chatters[this.userId];
    if (isChatter) return false;

    cronRewards.opts.chatters[this.userId] = true;
    cronRewards.changed('opts', true);

    await cronRewards.save();
    return true;
  }

  getRoleType(): UserRoleType {
    const user = this;
    if (user.isStreamer) return 'streamer';
    if (user.isAdmin) return 'admin';
    if (user.isMod) return 'mod';
    if (user.isVIP) return 'vip';
    if (user.isSub) return 'sub';
    return 'member';
  }

  async addPoints(cost: number, points: number, type: string, log: boolean) {
    const user = this;
    const userId = user.userId;
    const allPoints = user.points + points;

    const promises = [];
    if (log) promises.push(Log.create({ type, userId, cost, points, allPoints }));
    promises.push(user.increment({ points }));

    await Promise.all(promises);

    return true;
  }

  async setPoints(cost: number, points: number, type: string, log: boolean) {
    const user = this;
    const userId = user.userId;
    const allPoints = points;

    const promises = [];
    if (log) promises.push(Log.create({ type, userId, cost, points: 0, allPoints }));
    promises.push(user.update({ points }));
    await Promise.all(promises);

    return true;
  }

  async removePoints(cost: number, points: number, type: string, log: boolean) {
    const user = this;
    const userId = user.userId;
    const allPoints = user.points - points;

    const promises = [];
    if (log) promises.push(Log.create({ type, userId, cost, points, allPoints }));
    promises.push(user.decrement({ points }));

    await Promise.all(promises);

    return true;
  }
}

User.init(User.defaultAttributes, { sequelize: SEQUELIZE_DB_CONFIG });
