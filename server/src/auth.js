import {
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

const HASH_ALGORITHM = 'sha256';
const HASH_ITERATIONS = 120000;
const HASH_LENGTH = 32;
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const USER_TOKEN_TTL_DAYS = 30;

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64url(input) {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(
    password,
    salt,
    HASH_ITERATIONS,
    HASH_LENGTH,
    HASH_ALGORITHM
  ).toString('hex');

  return `pbkdf2$${HASH_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [scheme, iterationsText, salt, expectedHash] = String(storedHash).split('$');

  if (scheme !== 'pbkdf2' || !iterationsText || !salt || !expectedHash) {
    return false;
  }

  const actualHash = pbkdf2Sync(
    password,
    salt,
    Number(iterationsText),
    Buffer.from(expectedHash, 'hex').length,
    HASH_ALGORITHM
  );
  const expected = Buffer.from(expectedHash, 'hex');

  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export function createToken(user, secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    type: 'admin',
    username: user.username,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function createUserToken(user, secret, ttlDays = USER_TOKEN_TTL_DAYS) {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Number(ttlDays) * 24 * 60 * 60;
  const payload = {
    sub: user.id,
    type: 'user',
    iat: now,
    exp: now + ttlSeconds
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifyToken(token, secret) {
  const [encodedPayload, signature] = String(token || '').split('.');

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64url(encodedPayload));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function code2Openid(code, appId, appSecret, fetchImpl = fetch) {
  if (!appId || !appSecret) {
    const error = new Error('微信登录配置缺失');
    error.status = 500;
    throw error;
  }

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetchImpl(url);
  const result = await response.json();

  if (result.errcode) {
    const error = new Error(result.errmsg || '微信登录失败');
    error.status = 401;
    error.details = { errcode: result.errcode };
    throw error;
  }

  if (!result.openid) {
    const error = new Error('微信登录未返回 openid');
    error.status = 502;
    throw error;
  }

  return result;
}

export async function getWechatAccessToken(appId, appSecret, fetchImpl = fetch) {
  if (!appId || !appSecret) {
    const error = new Error('微信小程序配置缺失');
    error.status = 500;
    throw error;
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);

  const response = await fetchImpl(url);
  const result = await response.json();

  if (result.errcode) {
    const error = new Error(result.errmsg || '微信 access_token 获取失败');
    error.status = 502;
    error.details = { errcode: result.errcode };
    throw error;
  }

  if (!result.access_token) {
    const error = new Error('微信 access_token 响应无效');
    error.status = 502;
    throw error;
  }

  return {
    accessToken: result.access_token,
    expiresIn: Number(result.expires_in || 7200)
  };
}

export async function getWechatUnlimitedQRCode(request, fetchImpl = fetch) {
  if (!request?.accessToken) {
    const error = new Error('微信 access_token 缺失');
    error.status = 500;
    throw error;
  }

  const url = new URL('https://api.weixin.qq.com/wxa/getwxacodeunlimit');
  url.searchParams.set('access_token', request.accessToken);

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      scene: request.scene,
      page: request.page,
      check_path: Boolean(request.checkPath),
      env_version: request.envVersion,
      width: request.width
    })
  });
  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());

  if (contentType.includes('application/json')) {
    let result = {};
    try {
      result = JSON.parse(buffer.toString('utf8'));
    } catch {
      // Keep the generic response error below.
    }

    const error = new Error(result.errmsg || '微信小程序码生成失败');
    error.status = response.ok ? 502 : response.status;
    error.details = result.errcode ? { errcode: result.errcode } : undefined;
    throw error;
  }

  if (!response.ok) {
    const error = new Error('微信小程序码生成失败');
    error.status = response.status;
    throw error;
  }

  return {
    contentType: contentType || 'image/png',
    buffer
  };
}
