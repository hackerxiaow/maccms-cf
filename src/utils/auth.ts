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
   * 生成简单的安全管理 Session Token
   */
  static async generateToken(username: string, secret: string): Promise<string> {
    const payload = `${username}:${Date.now() + 7 * 24 * 3600 * 1000}`; // 7天有效期
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
   * 校验 Session Token
   */
  static async verifyToken(token: string, secret: string): Promise<boolean> {
    if (!token || !token.includes('.')) return false;
    try {
      const [payloadB64, sigHex] = token.split('.');
      const payload = atob(payloadB64);
      const [username, expStr] = payload.split(':');
      const exp = parseInt(expStr, 10);

      if (Date.now() > exp) return false; // 已过期

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

      return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
    } catch {
      return false;
    }
  }
}
