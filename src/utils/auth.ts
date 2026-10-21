// ========================================================
// 认证与安全工具类 (Web Crypto API 原生实现)
// ========================================================

export class AuthUtils {
  private static readonly PASSWORD_ITERATIONS = 120_000;

  /** PBKDF2 password storage for new credentials; legacy SHA-256 hashes are upgraded on login. */
  static async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: this.PASSWORD_ITERATIONS }, key, 256);
    const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    return `pbkdf2$${this.PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
  }

  static needsPasswordUpgrade(encoded: string): boolean {
    return !encoded.startsWith('pbkdf2$');
  }

  static async verifyPassword(password: string, encoded: string): Promise<boolean> {
    if (!encoded.startsWith('pbkdf2$')) return (await this.sha256(password)) === encoded;
    try {
      const [, iterationsText, saltText, hashText] = encoded.split('$');
      const iterations = Number(iterationsText);
      if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000 || !saltText || !hashText) return false;
      const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      const salt = fromBase64(saltText);
      const expected = fromBase64(hashText);
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, expected.length * 8));
      if (actual.length !== expected.length) return false;
      let difference = 0;
      for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
      return difference === 0;
    } catch {
      return false;
    }
  }

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
  static async generateToken(username: string, secret: string, days = 7, sessionId = ''): Promise<string> {
    const expireAt = Date.now() + days * 24 * 3600 * 1000;
    const payload = `${username}:${expireAt}${sessionId ? `:${sessionId}` : ''}`;
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
  static async verifyToken(token: string, secret: string): Promise<{ valid: boolean; username?: string; sessionId?: string }> {
    if (!token || !token.includes('.')) return { valid: false };
    try {
      const [payloadB64, sigHex] = token.split('.');
      const payload = atob(payloadB64);
      const [username, expStr, sessionId] = payload.split(':');
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
      return { valid: isValid, username: isValid ? username : undefined, sessionId: isValid ? sessionId : undefined };
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
