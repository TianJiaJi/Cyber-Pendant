/**
 * Cyber-Pendant 安全中间件模块
 *
 * 提供速率限制、安全响应头、CORS配置、密钥验证和CSV安全转义功能
 */

/**
 * 创建速率限制器
 *
 * 基于内存的限流实现，适合单实例部署。
 * 生产环境建议使用Redis等持久化存储。
 *
 * @param {Object} options - 配置选项
 * @param {number} options.windowMs - 时间窗口（毫秒）
 * @param {number} options.maxAttempts - 最大尝试次数
 * @param {boolean} options.skipSuccessfulRequests - 是否跳过成功请求的计数
 * @returns {Object} 速率限制器实例
 */
export function createRateLimit(options = {}) {
  const {
    windowMs = 60 * 1000,
    maxAttempts = 60,
    skipSuccessfulRequests = false
  } = options;

  // 存储请求记录: Map<identifier, {count: number, resetTime: number, failures: number}>
  const store = new Map();

  function now() {
    return Date.now();
  }

  function cleanup(identifier) {
    const entry = store.get(identifier);
    if (entry && now() >= entry.resetTime) {
      store.delete(identifier);
    }
  }

  return {
    /**
     * 检查是否允许请求
     * @param {string} identifier - 客户端标识（IP或用户ID）
     * @returns {{allowed: boolean, remaining: number, resetTime: number}}
     */
    check(identifier) {
      cleanup(identifier);

      const entry = store.get(identifier);
      const currentTime = now();

      if (!entry) {
        // 首次请求
        store.set(identifier, {
          count: 1,
          resetTime: currentTime + windowMs,
          failures: 0
        });
        return {
          allowed: true,
          remaining: maxAttempts - 1,
          resetTime: currentTime + windowMs
        };
      }

      // 检查是否超过限制
      if (entry.count >= maxAttempts) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: entry.resetTime
        };
      }

      // 增加计数
      entry.count++;
      return {
        allowed: true,
        remaining: maxAttempts - entry.count,
        resetTime: entry.resetTime
      };
    },

    /**
     * 记录失败尝试（用于登录等场景）
     * @param {string} identifier - 客户端标识
     */
    recordFailure(identifier) {
      cleanup(identifier);

      const entry = store.get(identifier);
      const currentTime = now();

      if (!entry) {
        store.set(identifier, {
          count: 1,
          resetTime: currentTime + windowMs,
          failures: 1
        });
      } else {
        entry.failures = (entry.failures || 0) + 1;
        if (!skipSuccessfulRequests) {
          entry.count++;
        }
      }
    },

    /**
     * 记录一次成功命中
     * @param {string} identifier - 客户端标识
     */
    recordHit(identifier) {
      cleanup(identifier);

      const entry = store.get(identifier);
      if (entry) {
        entry.count++;
      }
    },

    /**
     * 清除记录（用于成功登录后清除失败记录）
     * @param {string} identifier - 客户端标识
     */
    clear(identifier) {
      store.delete(identifier);
    },

    /**
     * 获取当前状态（用于调试）
     * @param {string} identifier - 客户端标识
     * @returns {Object|null}
     */
    getStatus(identifier) {
      return store.get(identifier) || null;
    }
  };
}

/**
 * 设置安全响应头
 *
 * @param {Object} res - HTTP响应对象
 * @param {Object} options - 配置选项
 * @param {boolean} options.isHttps - 是否使用HTTPS
 */
export function setSecurityHeaders(res, options = {}) {
  const { isHttps = false } = options;

  // 防止MIME类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY');

  // 启用浏览器XSS保护
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // 控制Referrer信息泄露
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HTTPS强制（仅在HTTPS连接时设置）
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 内容安全策略 - 防止 XSS 攻击
  // 允许同源资源、内联脚本/样式（Vue 需要）、data: 图片（二维码）
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
}

/**
 * 设置CORS响应头（带白名单验证）
 *
 * @param {Object} req - HTTP请求对象
 * @param {Object} res - HTTP响应对象
 * @param {Object} config - 配置对象
 */
export function setCorsHeaders(req, res, config) {
  const corsOrigin = config.corsOrigin || '*';

  // 解析允许的来源列表
  const allowedOrigins = corsOrigin === '*'
    ? ['*']
    : corsOrigin.split(',').map(o => o.trim()).filter(Boolean);

  const requestOrigin = req.headers.origin;

  if (allowedOrigins.includes('*')) {
    // 允许所有来源
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    // 来源在白名单中
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  } else {
    // 来源不在白名单中，不设置CORS头
    return;
  }

  // 设置其他CORS头
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24小时
}

/**
 * CSV值安全转义（防止公式注入）
 *
 * @param {*} value - 待转义的值
 * @returns {string} 转义后的CSV安全字符串
 */
export function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);

  // 防止CSV公式注入：在公式字符前添加单引号
  // Excel会将以单引号开头的值视为文本
  if (/^[=\-+@]/.test(text)) {
    return `'${text}`;
  }

  // 处理包含逗号、引号、换行符的值
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

/**
 * 从请求中提取客户端标识
 * 优先使用 X-Forwarded-For，其次使用 remoteAddress
 *
 * @param {Object} req - HTTP请求对象
 * @returns {string} 客户端标识
 */
export function getClientId(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For 可能包含多个IP，取第一个
    return forwardedFor.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * 验证管理员密码强度
 *
 * 密码要求：
 * - 至少 12 位字符
 * - 包含大小写字母、数字、特殊字符中的至少 3 种
 * - 不包含常见弱密码模式
 *
 * @param {string} password - 待验证的密码
 * @throws {Error} 如果密码强度不足
 */
export function validatePasswordStrength(password) {
  if (!password) {
    throw new Error('密码不能为空');
  }

  if (password.length < 12) {
    throw new Error('密码长度至少需要 12 位');
  }

  // 检查字符多样性
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_+\-=\[\]\\]/.test(password);

  const varietyCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (varietyCount < 3) {
    throw new Error(
      '密码需要包含大小写字母、数字、特殊字符中的至少 3 种。\n' +
      '当前密码仅包含: ' +
      [
        hasLower ? '小写字母' : '',
        hasUpper ? '大写字母' : '',
        hasDigit ? '数字' : '',
        hasSpecial ? '特殊字符' : ''
      ].filter(Boolean).join('、')
    );
  }

  // 检查常见弱密码模式
  const weakPatterns = [
    'password',
    'pass',
    'admin',
    '123456',
    '12345678',
    'qwerty',
    'abcdefgh',
    'abcd1234',
    'admin123',
    'password123',
    'qwer1234'
  ];

  const lower = password.toLowerCase();
  for (const pattern of weakPatterns) {
    if (lower.includes(pattern)) {
      throw new Error(`密码不能包含常见弱密码模式 "${pattern}"`);
    }
  }

  // 检查字符重复度（如果70%以上是同一个字符，认为太弱）
  const charCounts = {};
  for (const char of password) {
    charCounts[char] = (charCounts[char] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(charCounts));
  if (maxCount / password.length > 0.7) {
    throw new Error('密码包含过多重复字符，请使用更多样化的字符组合');
  }

  return true;
}
