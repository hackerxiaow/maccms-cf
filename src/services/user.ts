// ========================================================
// 会员用户与权限消费服务 (User & Ulog)
// ========================================================

import type { UserItem, UserGroupItem, UlogItem } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';

export class UserService {
  /** 环境密钥优先；本地开发首次使用时生成并持久化独立随机密钥。 */
  static async getTokenSecret(db: D1Database, configuredSecret = ''): Promise<string> {
    if (configuredSecret.length >= 32) return `MACCMS_USER_${configuredSecret}`;
    const current = await db.prepare("SELECT value FROM config WHERE key='user_token_secret'").first<{ value: string }>();
    if (current?.value && current.value.length >= 64) return current.value;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const generated = Array.from(bytes).map((value) => value.toString(16).padStart(2, '0')).join('');
    await db.prepare("INSERT OR IGNORE INTO config (key,value) VALUES ('user_token_secret',?)").bind(generated).run();
    const persisted = await db.prepare("SELECT value FROM config WHERE key='user_token_secret'").first<{ value: string }>();
    if (!persisted?.value) throw new Error('无法初始化会员 Token 密钥');
    return persisted.value;
  }

  /** Creates a revocable, device-scoped member token. */
  static async createUserSession(db: D1Database, userId: number, secret: string, ip = '', userAgent = ''): Promise<string> {
    const sessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 30 * 24 * 3600;
    const user = await db.prepare('SELECT user_name FROM user WHERE user_id=? AND user_status=1')
      .bind(userId).first<{ user_name: string }>();
    if (!user) throw new Error('账号不存在或已停用');
    await db.prepare(`INSERT INTO user_session (session_id,user_id,created_at,last_seen_at,expires_at,client_ip,user_agent)
      VALUES (?,?,?,?,?,?,?)`).bind(sessionId, userId, now, now, expiresAt, ip.slice(0, 64), userAgent.slice(0, 240)).run();
    return AuthUtils.generateToken(`user_${userId}`, secret, 30, sessionId);
  }

  /**
   * 会员注册
   */
  static async register(
    db: D1Database,
    data: { username: string; password: string; email?: string; phone?: string; nick?: string; invite_code?: string },
    ip = ''
  ): Promise<UserItem> {
    const username = (data.username || '').trim();
    const password = (data.password || '').trim();
    if (!username || !password) throw new Error('用户名和密码不能为空');
    if (username.length < 3 || username.length > 20) throw new Error('用户名长度须在 3-20 之间');
    if (password.length < 8) throw new Error('密码长度不能少于 8 位');
    const email = String(data.email || '').trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式无效');
    if (email && await db.prepare('SELECT user_id FROM user WHERE lower(user_email)=? LIMIT 1').bind(email).first()) throw new Error('该邮箱已绑定其他账号');

    // 查重
    const exists = await db.prepare('SELECT user_id FROM user WHERE user_name = ?').bind(username).first();
    if (exists) throw new Error('该用户名已被注册');

    // 查注册赠送积分
    const configRow = await db.prepare("SELECT value FROM config WHERE key = 'user_reg_points'").first<{ value: string }>();
    const regPoints = parseInt(configRow?.value || '50', 10);
    const inviteConfig = await db.prepare(`SELECT key,value FROM config WHERE key IN ('user_invite_status','user_invite_points','user_invited_points')`)
      .all<{ key: string; value: string }>();
    const inviteSettings: Record<string, string> = {};
    for (const row of inviteConfig.results || []) inviteSettings[row.key] = row.value;
    const inviteEnabled = inviteSettings.user_invite_status === '1';
    const inviteCode = String(data.invite_code || '').trim().toUpperCase();
    let inviterId = 0;
    if (inviteEnabled && inviteCode) {
      const inviter = await db.prepare(`SELECT code.user_id FROM user_invite_code code
        JOIN user ON user.user_id=code.user_id AND user.user_status=1 WHERE upper(code.invite_code)=? LIMIT 1`)
        .bind(inviteCode).first<{ user_id: number }>();
      if (!inviter) throw new Error('邀请码无效或邀请人账号已停用');
      inviterId = inviter.user_id;
    }

    const pwdHash = await AuthUtils.hashPassword(password);
    const now = Math.floor(Date.now() / 1000);

    const res = await db.prepare(`
      INSERT INTO user (
        group_id, user_name, user_pwd, user_nick, user_email, user_phone,
        user_status, user_points, user_reg_time, user_login_time, user_end_time, user_pid
      ) VALUES (1, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0, ?)
    `).bind(
      username,
      pwdHash,
      data.nick || username,
      email,
      data.phone || '',
      regPoints,
      now,
      now,
      inviterId
    ).run();

    const userId = Number(res.meta.last_row_id);
    let newInviteCode = '';
    for (let attempt = 0; attempt < 4 && !newInviteCode; attempt += 1) {
      const candidate = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
      try {
        await db.prepare('INSERT INTO user_invite_code (user_id,invite_code,created_at) VALUES (?,?,?)')
          .bind(userId, candidate, now).run();
        newInviteCode = candidate;
      } catch { /* Retry the very unlikely unique-code collision. */ }
    }
    if (!newInviteCode) throw new Error('邀请码生成失败，请稍后重试');
    if (inviterId) {
      const inviterReward = Math.max(0, Math.min(100000, Number.parseInt(inviteSettings.user_invite_points || '50', 10) || 0));
      const inviteeReward = Math.max(0, Math.min(100000, Number.parseInt(inviteSettings.user_invited_points || '0', 10) || 0));
      const reward = await db.prepare(`INSERT OR IGNORE INTO user_invite_reward
        (inviter_user_id,invitee_user_id,inviter_points,invitee_points,created_at) VALUES (?,?,?,?,?)`)
        .bind(inviterId, userId, inviterReward, inviteeReward, now).run();
      if (Number(reward.meta.changes || 0) === 1) {
        const statements: D1PreparedStatement[] = [];
        if (inviterReward > 0) {
          statements.push(db.prepare('UPDATE user SET user_points=user_points+? WHERE user_id=? AND user_status=1').bind(inviterReward, inviterId));
          statements.push(db.prepare(`INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
            SELECT ?,'invite_reward',0,?,1,'邀请新会员奖励','system',? WHERE changes()=1`).bind(inviterId, inviterReward, now));
        }
        if (inviteeReward > 0) {
          statements.push(db.prepare('UPDATE user SET user_points=user_points+? WHERE user_id=? AND user_status=1').bind(inviteeReward, userId));
          statements.push(db.prepare(`INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
            SELECT ?,'invite_reward',0,?,1,'受邀注册奖励','system',? WHERE changes()=1`).bind(userId, inviteeReward, now));
        }
        if (statements.length) await db.batch(statements);
      }
    }
    await db.prepare(`INSERT INTO user_login_log (user_id, user_name, action, client_ip, created_at)
      VALUES (?, ?, 'register', ?, ?)`)
      .bind(userId, username, ip, now).run();
    return {
      user_id: userId,
      group_id: 1,
      user_name: username,
      user_nick: data.nick || username,
      user_email: email,
      user_phone: data.phone || '',
      user_status: 1,
      user_points: regPoints,
      user_reg_time: now,
      user_login_time: now,
      user_login_ip: ip,
      user_last_login_time: 0,
      user_last_login_ip: '',
      user_login_num: 1,
      user_end_time: 0,
      user_pid: inviterId,
    };
  }

  /**
   * 会员登录
   */
  static async login(
    db: D1Database,
    username: string,
    password: string,
    ip: string,
    tokenSecret: string,
    userAgent = ''
  ): Promise<{ user: UserItem; token: string }> {
    const uName = (username || '').trim();
    const pwd = (password || '').trim();
    if (!uName || !pwd) throw new Error('请输入账号与密码');

    const row = await db.prepare(`
      SELECT u.*, g.group_name
      FROM user u
      LEFT JOIN user_group g ON u.group_id = g.group_id
      WHERE u.user_name = ?
      LIMIT 1
    `).bind(uName).first<UserItem>();

    if (!row) throw new Error('用户不存在');
    if (row.user_status === 0) throw new Error('该账号已被系统封禁');
    const passwordHash = row.user_pwd || '';
    const passwordValid = await AuthUtils.verifyPassword(pwd, passwordHash);
    if (!passwordValid) throw new Error('密码错误');
    if (AuthUtils.needsPasswordUpgrade(passwordHash)) {
      await db.prepare('UPDATE user SET user_pwd=? WHERE user_id=?').bind(await AuthUtils.hashPassword(pwd), row.user_id).run();
    }

    const now = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare(`
      UPDATE user SET
        user_last_login_time = user_login_time,
        user_last_login_ip = user_login_ip,
        user_login_time = ?,
        user_login_ip = ?,
        user_login_num = user_login_num + 1
      WHERE user_id = ?
      `).bind(now, ip, row.user_id),
      db.prepare(`INSERT INTO user_login_log (user_id, user_name, action, client_ip, created_at)
        VALUES (?, ?, 'login', ?, ?)`)
        .bind(row.user_id, row.user_name, ip, now),
    ]);

    delete row.user_pwd;

    const token = await this.createUserSession(db, row.user_id, tokenSecret, ip, userAgent);
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

  /** 更新可公开展示的会员资料，不允许通过此接口修改账号、会员组或积分。 */
  static async updateProfile(
    db: D1Database,
    userId: number,
    data: { nick?: unknown; email?: unknown; phone?: unknown }
  ): Promise<UserItem> {
    const existing = await db.prepare('SELECT user_nick,user_email,user_phone FROM user WHERE user_id=? AND user_status=1')
      .bind(userId).first<{ user_nick: string; user_email: string; user_phone: string }>();
    if (!existing) throw new Error('账号不存在或已停用');
    const nick = String(data.nick ?? existing.user_nick).trim();
    const email = String(data.email ?? existing.user_email).trim().toLowerCase();
    const phone = String(data.phone ?? existing.user_phone).trim();
    if (nick.length < 1 || nick.length > 40) throw new Error('昵称长度须在 1-40 个字符之间');
    const emailAt = email.indexOf('@');
    if (email.length > 120 || (email && (emailAt < 1 || email.lastIndexOf('.') <= emailAt + 1 || email.endsWith('.')))) throw new Error('邮箱格式无效');
    if (email && await db.prepare('SELECT user_id FROM user WHERE lower(user_email)=? AND user_id<>? LIMIT 1').bind(email, userId).first()) throw new Error('该邮箱已绑定其他账号');
    if (phone.length > 32) throw new Error('手机号长度不能超过 32 个字符');
    const result = await db.prepare(`UPDATE user SET user_nick=?,user_email=?,user_phone=?,
      user_email_verified=CASE WHEN lower(user_email)=? THEN user_email_verified ELSE 0 END
      WHERE user_id=? AND user_status=1`).bind(nick, email, phone, email, userId).run();
    if (!result.meta.changes) throw new Error('账号不存在或已停用');
    const user = await this.getUserProfile(db, userId);
    if (!user) throw new Error('账号不存在或已停用');
    return user;
  }

  /** 修改登录密码；保留现有 SHA-256 哈希格式以兼容当前 D1 账号。 */
  static async changePassword(db: D1Database, userId: number, currentPassword: string, nextPassword: string): Promise<void> {
    if (!currentPassword || !nextPassword) throw new Error('请填写当前密码和新密码');
    if (nextPassword.length < 8 || nextPassword.length > 128) throw new Error('新密码长度须为 8-128 个字符');
    if (currentPassword === nextPassword) throw new Error('新密码不能与当前密码相同');
    const user = await db.prepare('SELECT user_pwd FROM user WHERE user_id=? AND user_status=1')
      .bind(userId).first<{ user_pwd: string }>();
    if (!user) throw new Error('账号不存在或已停用');
    if (!await AuthUtils.verifyPassword(currentPassword, user.user_pwd)) throw new Error('当前密码不正确');
    await db.prepare('UPDATE user SET user_pwd=? WHERE user_id=? AND user_status=1')
      .bind(await AuthUtils.hashPassword(nextPassword), userId).run();
  }

  /**
   * 扣减/增加用户积分
   */
  static async updatePoints(db: D1Database, userId: number, delta: number): Promise<number> {
    const updated = await db.prepare(`UPDATE user SET user_points=user_points+?
      WHERE user_id=? AND user_status=1 AND user_points+?>=0`).bind(delta, userId, delta).run();
    if (!updated.meta.changes) {
      const user = await db.prepare('SELECT user_id FROM user WHERE user_id=?').bind(userId).first();
      if (!user) throw new Error('用户不存在');
      throw new Error('积分余额不足或账号不可用');
    }
    const balance = await db.prepare('SELECT user_points FROM user WHERE user_id=?').bind(userId).first<{ user_points: number }>();
    return Number(balance?.user_points || 0);
  }

  private static async hasVodPurchase(db: D1Database, userId: number, vodId: number, type: 'play' | 'download', nid: number): Promise<boolean> {
    const purchase = await db.prepare(`SELECT purchase_id FROM vod_access_purchase
      WHERE user_id=? AND vod_id=? AND access_type=? AND episode_id IN (0,?) LIMIT 1`)
      .bind(userId, vodId, type, nid).first();
    if (purchase) return true;
    const legacyType = type === 'play' ? 3 : 4;
    const legacy = await db.prepare(`SELECT ulog_id FROM ulog WHERE user_id=? AND ulog_mid=1 AND ulog_rid=?
      AND ulog_type=? AND ulog_nid IN (0,?) LIMIT 1`).bind(userId, vodId, legacyType, nid).first();
    return !!legacy;
  }

  /** Atomically charges a member and creates one unique episode entitlement. */
  private static async purchaseVodAccess(
    db: D1Database, userId: number, vodId: number, type: 'play' | 'download', nid: number, cost: number
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const legacyType = type === 'play' ? 3 : 4;
    await db.batch([
      db.prepare(`UPDATE user SET user_points=user_points-? WHERE user_id=? AND user_status=1 AND user_points>=?
        AND NOT EXISTS (SELECT 1 FROM vod_access_purchase WHERE user_id=? AND vod_id=? AND access_type=? AND episode_id IN (0,?))`)
        .bind(cost, userId, cost, userId, vodId, type, nid),
      db.prepare(`INSERT OR IGNORE INTO vod_access_purchase (user_id,vod_id,access_type,episode_id,points,created_at)
        SELECT ?,?,?,?,?,? WHERE changes()=1`).bind(userId, vodId, type, nid, cost, now),
      db.prepare(`INSERT INTO ulog (user_id,ulog_mid,ulog_type,ulog_rid,ulog_nid,ulog_points,ulog_time)
        SELECT ?,1,?,?,?,?,? WHERE changes()=1`).bind(userId, legacyType, vodId, nid, cost, now),
    ]);
    if (await this.hasVodPurchase(db, userId, vodId, type, nid)) return;
    const user = await db.prepare('SELECT user_id,user_points FROM user WHERE user_id=? AND user_status=1')
      .bind(userId).first<{ user_id: number; user_points: number }>();
    if (!user) throw new Error('账号不存在或已停用');
    if (user.user_points < cost) throw new Error(`积分不足，需要 ${cost} 积分`);
    throw new Error('本次购买未能完成，请重试');
  }

  /** Checks and optionally purchases access to a password/points/member-gated article. */
  static async checkArticlePermission(
    db: D1Database,
    userId: number,
    articleId: number,
    password = '',
    charge = true
  ): Promise<{ canRead: boolean; reason?: string; needPoints?: number; passwordRequired?: boolean }> {
    const art = await db.prepare(`SELECT art_id,art_name,art_status,group_id,art_points,art_pwd
      FROM art WHERE art_id=? AND art_status=1`).bind(articleId)
      .first<{ art_id: number; art_name: string; art_status: number; group_id: number; art_points: number; art_pwd: string }>();
    if (!art) return { canRead: false, reason: '文章不存在或已下架' };
    const cost = Math.max(0, Number(art.art_points) || 0);
    const hasGroupGate = Number(art.group_id) > 1;
    const hasPassword = !!art.art_pwd;
    if (!hasGroupGate && cost <= 0 && !hasPassword) return { canRead: true };
    if (hasPassword && password !== art.art_pwd) return { canRead: false, reason: '文章需要访问密码', passwordRequired: true };

    let user: UserItem | null = null;
    if (userId > 0) user = await this.getUserProfile(db, userId);
    if (hasGroupGate || cost > 0) {
      if (!user || user.user_status !== 1) return { canRead: false, reason: '请登录后阅读', needPoints: cost };
      const now = Math.floor(Date.now() / 1000);
      const activeGroup = user.group_id >= 2 && user.user_end_time > now ? user.group_id : 1;
      if (activeGroup < art.group_id) return { canRead: false, reason: '当前会员组等级不足以阅读此文章' };
      if (user.group_id >= 2 && user.user_end_time > now) return { canRead: true };
    }

    const purchase = await db.prepare(`SELECT purchase_id FROM content_access_purchase
      WHERE user_id=? AND model='art' AND content_id=? LIMIT 1`).bind(userId, articleId).first();
    if (purchase) return { canRead: true };
    const legacy = userId > 0 ? await db.prepare(`SELECT ulog_id FROM ulog
      WHERE user_id=? AND ulog_mid=2 AND ulog_rid=? AND ulog_type=3 LIMIT 1`).bind(userId, articleId).first() : null;
    if (legacy) return { canRead: true };
    if (cost <= 0) return { canRead: true };
    if (!user || user.user_points < cost) return { canRead: false, reason: `积分不足，阅读本文需 ${cost} 积分`, needPoints: cost };
    if (!charge) return { canRead: false, reason: `购买本文需要 ${cost} 积分`, needPoints: cost };

    const now = Math.floor(Date.now() / 1000);
    await db.batch([
      db.prepare(`UPDATE user SET user_points=user_points-? WHERE user_id=? AND user_status=1 AND user_points>=?
        AND NOT EXISTS (SELECT 1 FROM content_access_purchase WHERE user_id=? AND model='art' AND content_id=?)`)
        .bind(cost, userId, cost, userId, articleId),
      db.prepare(`INSERT OR IGNORE INTO content_access_purchase (user_id,model,content_id,points,created_at)
        SELECT ?,'art',?,?,? WHERE changes()=1`).bind(userId, articleId, cost, now),
      db.prepare(`INSERT INTO ulog (user_id,ulog_mid,ulog_type,ulog_rid,ulog_points,ulog_time)
        SELECT ?,2,3,?,?,? WHERE changes()=1`).bind(userId, articleId, cost, now),
    ]);
    const purchased = await db.prepare(`SELECT purchase_id FROM content_access_purchase
      WHERE user_id=? AND model='art' AND content_id=? LIMIT 1`).bind(userId, articleId).first();
    if (!purchased) return { canRead: false, reason: '文章购买未完成，请重试' };
    return { canRead: true };
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
    nid = 1,
    charge = true
  ): Promise<{ canPlay: boolean; reason?: string; needPoints?: number; trialSeconds?: number }> {
    const vod = await db.prepare(`SELECT vod_id, vod_name, group_id, vod_points, vod_points_play, vod_trysee
      FROM vod WHERE vod_id = ? AND vod_status = 1`)
      .bind(vodId)
      .first<{ vod_id: number; vod_name: string; group_id: number; vod_points: number; vod_points_play: number; vod_trysee: number }>();

    if (!vod) return { canPlay: false, reason: '视频不存在' };

    // 免费视频且无会员组限制
    if (vod.group_id <= 1 && vod.vod_points <= 0 && vod.vod_points_play <= 0) {
      return { canPlay: true };
    }

    const trialSeconds = Math.max(0, Number(vod.vod_trysee) || 0) * 60;
    if (!userId || userId <= 0) {
      return trialSeconds > 0
        ? { canPlay: true, reason: '试看', trialSeconds }
        : { canPlay: false, reason: '需要登录后观看', needPoints: vod.vod_points_play || vod.vod_points };
    }

    const user = await this.getUserProfile(db, userId);
    if (!user) return { canPlay: false, reason: '登录状态已失效' };

    // VIP 用户全站免费
    const now = Math.floor(Date.now() / 1000);
    if (user.user_status !== 1) return { canPlay: false, reason: '会员账号已停用' };
    if (user.group_id >= 2 && user.user_end_time > now) {
      return { canPlay: true };
    }

    // 会员组权限判定
    const activeGroup = user.group_id >= 2 && user.user_end_time > now ? user.group_id : 1;
    if (activeGroup < vod.group_id) {
      if (trialSeconds > 0) return { canPlay: true, reason: '试看', trialSeconds };
      return { canPlay: false, reason: '当前会员组等级不足以观看此影片' };
    }

    // 检查是否已经购买过整片或该集
    if (await this.hasVodPurchase(db, userId, vodId, 'play', nid)) {
      return { canPlay: true };
    }

    const cost = vod.vod_points_play > 0 ? vod.vod_points_play : vod.vod_points;
    if (cost > 0) {
      if (user.user_points < cost) {
        if (trialSeconds > 0) return { canPlay: true, reason: '试看', trialSeconds, needPoints: cost };
        return { canPlay: false, reason: `积分不足，本片需消耗 ${cost} 积分`, needPoints: cost };
      }
      if (!charge) return { canPlay: true, needPoints: cost };
      await this.purchaseVodAccess(db, userId, vodId, 'play', nid, cost);
    }

    return { canPlay: true };
  }

  /** 下载权限核验：按整片/单集购买记录授权，并将下载消费记为 ulog_type=4。 */
  static async checkDownloadPermission(
    db: D1Database,
    userId: number,
    vodId: number,
    nid = 1
  ): Promise<{ canDownload: boolean; reason?: string; needPoints?: number }> {
    const vod = await db.prepare(`SELECT vod_id,vod_name,group_id,vod_points,vod_points_down
      FROM vod WHERE vod_id=? AND vod_status=1`).bind(vodId)
      .first<{ vod_id: number; vod_name: string; group_id: number; vod_points: number; vod_points_down: number }>();
    if (!vod) return { canDownload: false, reason: '视频不存在或已下架' };
    if (vod.group_id <= 1 && vod.vod_points <= 0 && vod.vod_points_down <= 0) return { canDownload: true };
    if (!userId || userId <= 0) return { canDownload: false, reason: '请登录后下载', needPoints: vod.vod_points_down || vod.vod_points };

    const user = await this.getUserProfile(db, userId);
    if (!user || user.user_status !== 1) return { canDownload: false, reason: '登录状态已失效或账号已停用' };
    const now = Math.floor(Date.now() / 1000);
    if (user.group_id >= 2 && user.user_end_time > now) return { canDownload: true };
    const activeGroup = user.group_id >= 2 && user.user_end_time > now ? user.group_id : 1;
    if (activeGroup < vod.group_id) return { canDownload: false, reason: '当前会员组等级不足以下载此影片' };

    if (await this.hasVodPurchase(db, userId, vodId, 'download', nid)) return { canDownload: true };

    const cost = vod.vod_points_down > 0 ? vod.vod_points_down : vod.vod_points;
    if (cost > 0) {
      if (user.user_points < cost) return { canDownload: false, reason: `积分不足，下载本集需 ${cost} 积分`, needPoints: cost };
      await this.purchaseVodAccess(db, userId, vodId, 'download', nid, cost);
    }
    return { canDownload: true };
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
