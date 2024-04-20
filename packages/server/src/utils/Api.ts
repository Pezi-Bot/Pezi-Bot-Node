import axios from 'axios';
import { CONFIG } from './Config';
import { ApiTwitchIds, ApiTwitchStatus, ApiViewersIds, TwitchIds } from '@pezi-bot/shared';

export class Api {
  private static twitchIds: TwitchIds = false;
  private static headers = { 'Client-Id': CONFIG.clientId, Authorization: `Bearer ${CONFIG.accessToken}` };

  private static async getTwitchIds(): Promise<TwitchIds> {
    try {
      if (Api.twitchIds) return Api.twitchIds;

      const url = `https://api.twitch.tv/helix/users`;
      const headers = Api.headers;

      const res: ApiTwitchIds = await axios.get(url, {
        headers,
        params: { login: [CONFIG.username, CONFIG.streamer] },
      });

      Api.twitchIds = {
        moderator_id: res.data.data.find((u) => u.login === CONFIG.username)!.id,
        broadcaster_id: res.data.data.find((u) => u.login === CONFIG.streamer)!.id,
      };

      return Api.twitchIds;
    } catch (ex) {
      console.log(`There was an error while calling Api.getBroadcasterId`);
      console.log(ex);

      return false;
    }
  }

  static async isStreamOnline(): Promise<boolean> {
    try {
      const url = `https://api.twitch.tv/helix/streams`;
      const headers = Api.headers;

      const res: ApiTwitchStatus = await axios.get(url, { headers, params: { user_login: CONFIG.streamer } });
      const data = res.data.data[0];

      const isOnline = data?.type !== 'live';
      return isOnline;
    } catch (ex) {
      console.log(`There was an error while calling Api.isStreamOnline`);
      console.log(ex);

      return false;
    }
  }

  static async getViewerUserIds(): Promise<string[]> {
    try {
      const ids = await Api.getTwitchIds();
      if (!ids) throw Error(`Couldn't fetch streamer and bot id`);

      const url = `https://api.twitch.tv/helix/chat/chatters`;
      const headers = Api.headers;

      let after = undefined;
      const viewers = [];
      do {
        const res: ApiViewersIds = await axios.get(url, { headers, params: { ...Api.twitchIds, first: 1000, after } });
        viewers.push(...res.data.data.map((u) => u.user_login));
        after = res.data.pagination.cursor;
      } while (after);

      return viewers;
    } catch (ex) {
      console.log(`There was an error while calling Api.getViewers`);
      console.log(ex);

      return [];
    }
  }
}
