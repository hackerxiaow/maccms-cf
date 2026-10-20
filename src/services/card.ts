// ========================================================
// 充值卡密管理与核销服务 (Card Service)
// ========================================================

import type { CardItem } from '../types/index.ts';
import { AuthUtils } from '../utils/auth.ts';
import { UserService } from './user.ts';

export class CardService {
  /**
   * 批量生成充值卡密
   */
  static async generateCards(
    db: D1Database,
    count = 10,
    points = 100,
    money = 10
  ): Promise<CardItem[]> {
    const num = Math.min(100, Math.max(1, count));
    const now = Math.floor(Date.now() / 1000);
    const createdList: CardItem[] = [];

    for (let i = 0; i < num; i++) {
      const pair = AuthUtils.generateCardPair();
      const pwdHash = await AuthUtils.sha256(pair.cardPwd);

      await db.prepare(`
        INSERT INTO card (card_no, card_pwd, card_money, card_points, card_use_status, card_add_time)
        VALUES (?, ?, ?, ?, 0, ?)
      `).bind(pair.cardNo, pwdHash, money, points, now).run();

      createdList.push({
        card_id: 0,
        card_no: pair.cardNo,
        card_pwd: pair.cardPwd, // 明文供管理员导出复制
        card_money: money,
        card_points: points,
        card_use_status: 0,
        user_id: 0,
        card_add_time: now,
        card_use_time: 0,
      });
    }

    return createdList;
  }

  /**
   * 用户核销充值卡密
   */
  static async redeemCard(
    db: D1Database,
    userId: number,
    cardNo: string,
    cardPwd: string
  ): Promise<{ points: number; newTotal: number }> {
    const no = (cardNo || '').trim();
    const pwd = (cardPwd || '').trim();
    if (!no || !pwd) throw new Error('请输入卡号与卡密');

    const card = await db.prepare('SELECT * FROM card WHERE card_no = ?').bind(no).first<CardItem>();
    if (!card) throw new Error('充值卡不存在');
    if (card.card_use_status === 1) throw new Error('该卡密已被使用');

    const pwdHash = await AuthUtils.sha256(pwd);
    if (card.card_pwd !== pwdHash && card.card_pwd !== pwd) {
      throw new Error('卡号或卡密错误');
    }

    const now = Math.floor(Date.now() / 1000);

    // 原子标记已使用
    await db.prepare(`
      UPDATE card SET
        card_use_status = 1,
        user_id = ?,
        card_use_time = ?
      WHERE card_id = ?
    `).bind(userId, now, card.card_id).run();

    // 增加用户积分
    const newTotal = await UserService.updatePoints(db, userId, card.card_points);

    // 记录 ulog
    await UserService.addUlog(db, {
      userId,
      mid: 1,
      type: 5, // 充值
      rid: card.card_id,
      points: card.card_points,
    });

    return { points: card.card_points, newTotal };
  }

  /**
   * 后台分页查询卡密列表
   */
  static async queryCards(
    db: D1Database,
    opts: { page?: number; limit?: number; status?: number; no?: string } = {}
  ): Promise<{ list: CardItem[]; total: number; page: number; limit: number; pagecount: number }> {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (opts.status !== undefined && opts.status !== -1) {
      conditions.push('c.card_use_status = ?');
      params.push(opts.status);
    }
    if (opts.no && opts.no.trim()) {
      conditions.push('c.card_no LIKE ?');
      params.push(`%${opts.no.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.prepare(`SELECT COUNT(*) as c FROM card c ${whereClause}`).bind(...params).first<{ c: number }>();
    const total = countRes?.c || 0;
    const pagecount = Math.ceil(total / limit);

    const rows = await db.prepare(`
      SELECT c.*, u.user_name
      FROM card c
      LEFT JOIN user u ON c.user_id = u.user_id
      ${whereClause}
      ORDER BY c.card_id DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<CardItem>();

    return { list: rows.results || [], total, page, limit, pagecount };
  }

  static async deleteCard(db: D1Database, id: number): Promise<boolean> {
    await db.prepare('DELETE FROM card WHERE card_id = ?').bind(id).run();
    return true;
  }
}
