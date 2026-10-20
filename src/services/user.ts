// ========================================================
// 会员用户与权限消费服务 (User & Ulog)
// ========================================================

import type { UserItem, UserGroupItem, UlogItem } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';

export class UserService {
  /**
   * 会员注册
   */
  static async register(
    db: D1Database,
    data: { username: string; password: string; email?: string; phone?: string; nick?: string }
  ): Promise<UserItem> {
    const username = (data.username || '').trim();
    const password = (data.password || '').trim();
    if (!username || !password) throw new Error('用户名和密码不能为空');
    if (username.length < 3 || username.length > 20) throw new Error('用户名长度须在 3-20 之间');
    if (password.length < 6) throw new Error('密码长度不能少于 6 位');

    // 查重
    const exists = await db.prepare('SELECT user_id FROM user WHERE user_name = ?').bind(username).first();
    if (exists) throw new Error('该用户名已被注册');

    // 查注册赠送积分
    const configRow = await db.prepare("SELECT value FROM config WHERE key = 'user_reg_points'").first<{ value: string }>();
    const regPoints = parseInt(configRow?.value || '50', 10);

    const pwdHash = await AuthUtils.sha256(password);
    const now = Math.floor(Date.now() / 1000);

    const res = await db.prepare(`
      INSERT INTO user (
        group_id, user_name, user_pwd, user_nick, user_email, user_phone,
        user_status, user_points, user_reg_time, user_login_time, user_end_time
      ) VALUES (1, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0)
    `).bind(
      username,
      pwdHash,
      data.nick || username,
      data.email || '',
      data.phone || '',
      regPoints,
      now,
      now
    ).run();

    const userId = Number(res.meta.last_row_id);
    return {
      user_id: userId,
      group_id: 1,
      user_name: username,
      user_nick: data.nick || username,
      user_email: data.email || '',
      user_phone: data.phone || '',
      user_status: 1,
      user_points: regPoints,
      user_reg_time: now,
      user_login_time: now,
      user_login_ip: '',
      user_last_login_time: 0,
      user_last_login_ip: '',
      user_login_num: 1,
      user_end_time: 0,
      user_pid: 0,
    };
  }

  /**
   * 会员登录
   */
  static async login(
    db: D1Database,
    username: string,
    password: string,
    ip = ''
  ): Promise<{ user: UserItem; token: string }> {
    const uName = (username || '').trim();
    const pwd = (password || '').trim();
    if (!uName || !pwd) throw new Error('请输入账号与密码');

    const pwdHash = await AuthUtils.sha256(pwd);
    const row = await db.prepare(`
      SELECT u.*, g.group_name
      FROM user u
      LEFT JOIN user_group g ON u.group_id = g.group_id
      WHERE u.user_name = ?
      LIMIT 1
    `).bind(uName).first<UserItem>();

    if (!row) throw new Error('用户不存在');
    if (row.user_status === 0) throw new Error('该账号已被系统封禁');
    if (row.user_pwd !== pwdHash) throw new Error('密码错误');

    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
      UPDATE user SET
        user_last_login_time = user_login_time,
        user_last_login_ip = user_login_ip,
        user_login_time = ?,
        user_login_ip = ?,
        user_login_num = user_login_num + 1
      WHERE user_id = ?
    `).bind(now, ip, row.user_id).run();

    delete row.user_pwd;

    // 动态密钥
    const token = await AuthUtils.generateToken(`user_${row.user_id}`, 'MACCMS_USER_SECRET', 30);
    return { user: row, token };
  }

  /**
   * 获取用户信息
   */
  static async getUserProfile(db: D1Database, userId: number): Promise<UserItem | null> {
    const row = await db.prepare(`
      SELECT u.*, g.group_name
      FROM user u
      LEFT JOIN user_group g ON u.group_id = g.group_id
      WHERE u.user_id = ?
      LIMIT 1
    `).bind(userId).first<UserItem>();
    if (row) {
      delete row.user_pwd;
    }
    return row || null;
  }

  /**
   * 扣减/增加用户积分
   */
  static async updatePoints(db: D1Database, userId: number, delta: number): Promise<number> {
    const user = await db.prepare('SELECT user_points FROM user WHERE user_id = ?').bind(userId).first<{ user_points: number }>();
    if (!user) throw new Error('用户不存在');
    const newPoints = user.user_points + delta;
    if (newPoints < 0) throw new Error('积分余额不足');

    await db.prepare('UPDATE user SET user_points = ? WHERE user_id = ?').bind(newPoints, userId).run();
    return newPoints;
  }

  /**
   * 兑换购买 VIP 身份
   */
  static async buyVip(db: D1Database, userId: number, type: 'day' | 'week' | 'month' | 'year'): Promise<{ end_time: number }> {
    const prices: Record<string, { points: number; days: number }> = {
      day: { points: 10, days: 1 },
      week: { points: 50, days: 7 },
      month: { points: 180, days: 30 },
      year: { points: 1800, days: 365 },
    };
    const item = prices[type] || prices.month;
    await this.updatePoints(db, userId, -item.points);

    const user = await db.prepare('SELECT user_end_time FROM user WHERE user_id = ?').bind(userId).first<{ user_end_time: number }>();
    const now = Math.floor(Date.now() / 1000);
    const currentEnd = Math.max(now, user?.user_end_time || 0);
    const newEndTime = currentEnd + item.days * 86400;

    await db.prepare('UPDATE user SET group_id = 2, user_end_time = ? WHERE user_id = ?').bind(newEndTime, userId).run();
    return { end_time: newEndTime };
  }

  /**
   * 点播鉴权核验：判断用户是否有权观看视频
   */
  static async checkPlayPermission(
    db: D1Database,
    userId: number,
    vodId: number,
    nid = 1
  ): Promise<{ canPlay: boolean; reason?: string; needPoints?: number }> {
    const vod = await db.prepare('SELECT vod_id, vod_name, group_id, vod_points, vod_points_play, vod_trysee FROM vod WHERE vod_id = ?')
      .bind(vodId)
      .first<{ vod_id: number; vod_name: string; group_id: number; vod_points: number; vod_points_play: number; vod_trysee: number }>();

    if (!vod) return { canPlay: false, reason: '视频不存在' };

    // 免费视频且无会员组限制
    if (vod.group_id <= 1 && vod.vod_points <= 0 && vod.vod_points_play <= 0) {
      return { canPlay: true };
    }

    if (!userId || userId <= 0) {
      return { canPlay: false, reason: '需要登录后观看', needPoints: vod.vod_points_play || vod.vod_points };
    }

    const user = await this.getUserProfile(db, userId);
    if (!user) return { canPlay: false, reason: '登录状态已失效' };

    // VIP 用户全站免费
    const now = Math.floor(Date.now() / 1000);
    if (user.group_id >= 2 && user.user_end_time > now) {
      return { canPlay: true };
    }

    // 会员组权限判定
    if (user.group_id < vod.group_id) {
      return { canPlay: false, reason: '当前会员组等级不足以观看此影片' };
    }

    // 检查是否已经购买过整片或该集
    const hasBought = await db.prepare(`
      SELECT ulog_id FROM ulog
      WHERE user_id = ? AND ulog_rid = ? AND (ulog_type = 3 OR (ulog_type = 3 AND ulog_nid = ?))
      LIMIT 1
    `).bind(userId, vodId, nid).first();

    if (hasBought) {
      return { canPlay: true };
    }

    const cost = vod.vod_points_play > 0 ? vod.vod_points_play : vod.vod_points;
    if (cost > 0) {
      if (user.user_points < cost) {
        return { canPlay: false, reason: `积分不足，本片需消耗 ${cost} 积分`, needPoints: cost };
      }
      // 扣费并记录消费凭证
      await this.updatePoints(db, userId, -cost);
      await this.addUlog(db, {
        userId,
        mid: 1,
        type: 3, // 点播扣费
        rid: vodId,
        nid,
        points: cost,
      });
    }

    return { canPlay: true };
  }

  // ==========================================
  // 用户足迹日志 (观看历史、收藏夹、已购记录)
  // ==========================================

  static async addUlog(
    db: D1Database,
    data: { userId: number; mid: number; type: number; rid: number; sid?: number; nid?: number; points?: number }
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    // 如果是收藏或历史记录，防重覆盖
    if (data.type === 1 || data.type === 2) {
      await db.prepare(`
        DELETE FROM ulog
        WHERE user_id = ? AND ulog_type = ? AND ulog_mid = ? AND ulog_rid = ?
      `).bind(data.userId, data.type, data.mid, data.rid).run().catch(() => {});
    }

    await db.prepare(`
      INSERT INTO ulog (user_id, ulog_mid, ulog_type, ulog_rid, ulog_sid, ulog_nid, ulog_points, ulog_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.userId,
      data.mid,
      data.type,
      data.rid,
      data.sid || 0,
      data.nid || 0,
      data.points || 0,
      now
    ).run();
  }

  static async toggleFav(db: D1Database, userId: number, mid: number, rid: number): Promise<{ isFav: boolean }> {
    const existing = await db.prepare('SELECT ulog_id FROM ulog WHERE user_id = ? AND ulog_type = 2 AND ulog_mid = ? AND ulog_rid = ?')
      .bind(userId, mid, rid).first();

    if (existing) {
      await db.prepare('DELETE FROM ulog WHERE user_id = ? AND ulog_type = 2 AND ulog_mid = ? AND ulog_rid = ?')
        .bind(userId, mid, rid).run();
      return { isFav: false };
    } else {
      await this.addUlog(db, { userId, mid, type: 2, rid });
      return { isFav: true };
    }
  }

  static async getUlogs(
    db: D1Database,
    userId: number,
    type: number,
    limit = 30
  ): Promise<UlogItem[]> {
    const rows = await db.prepare(`
      SELECT u.*, v.vod_name as target_name, v.vod_pic as target_pic
      FROM ulog u
      LEFT JOIN vod v ON u.ulog_mid = 1 AND u.ulog_rid = v.vod_id
      WHERE u.user_id = ? AND u.ulog_type = ?
      ORDER BY u.ulog_time DESC
      LIMIT ?
    `).bind(userId, type, limit).all<UlogItem>();

    return rows.results || [];
  }

  // ==========================================
  // 后台管理会员接口
  // ==========================================

  static async queryUsers(
    db: D1Database,
    opts: { page?: number; limit?: number; wd?: string } = {}
  ): Promise<{ list: UserItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(50, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (opts.wd && opts.wd.trim()) {
      conditions.push('(u.user_name LIKE ? OR u.user_nick LIKE ? OR u.user_email LIKE ?)');
      const kw = `%${opts.wd.trim()}%`;
      params.push(kw, kw, kw);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.prepare(`SELECT COUNT(*) as c FROM user u ${whereClause}`).bind(...params).first<{ c: number }>();
    const total = countRes?.c || 0;
    const pagecount = Math.ceil(total / limit);

    const rows = await db.prepare(`
      SELECT u.*, g.group_name
      FROM user u
      LEFT JOIN user_group g ON u.group_id = g.group_id
      ${whereClause}
      ORDER BY u.user_id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<UserItem>();

    const list = (rows.results || []).map(u => {
      delete u.user_pwd;
      return u;
    });

    return { list, total, page, limit, pagecount };
  }

  static async saveUser(db: D1Database, data: Partial<UserItem> & { new_pwd?: string }): Promise<number> {
    if (data.user_id && data.user_id > 0) {
      if (data.new_pwd && data.new_pwd.trim()) {
        const hash = await AuthUtils.sha256(data.new_pwd.trim());
        await db.prepare('UPDATE user SET user_pwd = ? WHERE user_id = ?').bind(hash, data.user_id).run();
      }
      await db.prepare(`
        UPDATE user SET
          group_id = ?, user_nick = ?, user_email = ?, user_phone = ?,
          user_status = ?, user_points = ?, user_end_time = ?
        WHERE user_id = ?
      `).bind(
        data.group_id || 1,
        data.user_nick || '',
        data.user_email || '',
        data.user_phone || '',
        data.user_status !== undefined ? data.user_status : 1,
        data.user_points || 0,
        data.user_end_time || 0,
        data.user_id
      ).run();
      return data.user_id;
    }
    return 0;
  }

  static async deleteUser(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM user WHERE user_id = ?').bind(id).run();
    await db.prepare('DELETE FROM ulog WHERE user_id = ?').bind(id).run();
    return true;
  }

  static async getUserGroups(db: D1Database): Promise<UserGroupItem[]> {
    const rows = await db.prepare('SELECT * FROM user_group ORDER BY group_id ASC').all<UserGroupItem>();
    return rows.results || [];
  }

  static async saveUserGroup(db: D1Database, data: Partial<UserGroupItem>): Promise<number> {
    if (data.group_id && data.group_id > 0) {
      await db.prepare(`
        UPDATE user_group SET
          group_name = ?, group_status = ?, group_points_day = ?,
          group_points_week = ?, group_points_month = ?, group_points_year = ?,
          group_points_free = ?
        WHERE group_id = ?
      `).bind(
        data.group_name || '',
        data.group_status !== undefined ? data.group_status : 1,
        data.group_points_day || 10,
        data.group_points_week || 50,
        data.group_points_month || 180,
        data.group_points_year || 1800,
        data.group_points_free || 0,
        data.group_id
      ).run();
      return data.group_id;
    } else {
      const res = await db.prepare(`
        INSERT INTO user_group (
          group_name, group_status, group_points_day, group_points_week,
          group_points_month, group_points_year, group_points_free
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        data.group_name || '',
        data.group_status !== undefined ? data.group_status : 1,
        data.group_points_day || 10,
        data.group_points_week || 50,
        data.group_points_month || 180,
        data.group_points_year || 1800,
        data.group_points_free || 0
      ).run();
      return Number(res.meta.last_row_id);
    }
  }
}
