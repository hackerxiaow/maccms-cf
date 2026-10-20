// ========================================================
// 认证与安全工具类 (Web Crypto API 原生实现)
// ========================================================

export class AuthUtils {
  /**
   * 计算字符串的 SHA-256 十六进制哈希
   */
  static async sha256(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 生成安全 Session Token (支持自定义有效期，默认7天)
   */
  static async generateToken(username: string, secret: string, days = 7): Promise<string> {
    const expireAt = Date.now() + days * 24 * 3600 * 1000;
    const payload = `${username}:${expireAt}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const sigHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return `${btoa(payload)}.${sigHex}`;
  }

  /**
   * 校验 Session Token 并返回状态与解析账号
   */
  static async verifyToken(token: string, secret: string): Promise<{ valid: boolean; username?: string }> {
    if (!token || !token.includes('.')) return { valid: false };
    try {
      const [payloadB64, sigHex] = token.split('.');
      const payload = atob(payloadB64);
      const [username, expStr] = payload.split(':');
      const exp = parseInt(expStr, 10);

      if (Date.now() > exp) return { valid: false }; // 已过期

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const sigBytes = new Uint8Array(
        sigHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );

      const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
      return { valid: isValid, username: isValid ? username : undefined };
    } catch {
      return { valid: false };
    }
  }

  /**
   * 批量生成随机充值卡卡号与卡密
   */
  static generateCardPair(): { cardNo: string; cardPwd: string } {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const randStr = (len: number) => {
      let res = '';
      const bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
      for (let i = 0; i < len; i++) {
        res += chars[bytes[i] % chars.length];
      }
      return res;
    };
    return {
      cardNo: `MC${Date.now().toString().slice(-6)}${randStr(6)}`,
      cardPwd: randStr(12),
    };
  }
}
