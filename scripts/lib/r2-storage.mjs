import { createHash, createHmac } from 'node:crypto';

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

function requiredEnv(name, env = process.env) {
  const value = String(env[name] ?? '').trim();
  if (!value) throw new Error('Falta configurar ' + name + ' en el entorno de Vercel.');
  return value;
}

export function getR2Config(env = process.env) {
  const accountId = requiredEnv('R2_ACCOUNT_ID', env);
  const accessKeyId = requiredEnv('R2_ACCESS_KEY_ID', env);
  const secretAccessKey = requiredEnv('R2_SECRET_ACCESS_KEY', env);
  const bucket = requiredEnv('R2_BUCKET_NAME', env);
  const publicBaseUrl = requiredEnv('R2_PUBLIC_BASE_URL', env).replace(/\/+$/, '');
  const publicUrl = new URL(publicBaseUrl);
  if (publicUrl.protocol !== 'https:') throw new Error('R2_PUBLIC_BASE_URL debe utilizar HTTPS.');
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl, publicUrl };
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function isWebpBuffer(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export function imageObjectKey(hash) {
  if (!/^[a-f0-9]{64}$/.test(String(hash))) throw new Error('Huella SHA-256 no válida.');
  return 'images/' + hash + '.webp';
}

export function imagePublicUrl(publicBaseUrl, key) {
  const base = String(publicBaseUrl).replace(/\/+$/, '');
  return base + '/' + String(key).split('/').map(encodeURIComponent).join('/');
}

export function parseManagedImageUrl(value, config = getR2Config()) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let candidate;
  try { candidate = new URL(value); } catch { return null; }
  if (candidate.origin !== config.publicUrl.origin) return null;
  const basePath = config.publicUrl.pathname.replace(/\/+$/, '');
  if (basePath && candidate.pathname !== basePath && !candidate.pathname.startsWith(basePath + '/')) return null;
  const relativePath = candidate.pathname.slice(basePath.length).replace(/^\/+/, '');
  const match = /^images\/([a-f0-9]{64})\.webp$/i.exec(relativePath);
  if (!match) return null;
  const hash = match[1].toLowerCase();
  return { hash, key: imageObjectKey(hash) };
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

function signingKey(secret, dateStamp) {
  const dateKey = hmac('AWS4' + secret, dateStamp);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

export function createR2Authorization({ method, key, body = Buffer.alloc(0), contentType, config, now = new Date() }) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const payloadHash = payload.length ? sha256Hex(payload) : EMPTY_SHA256;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = config.accountId + '.r2.cloudflarestorage.com';
  const canonicalUri = '/' + encodeURIComponent(config.bucket) + '/' + String(key).split('/').map(encodeURIComponent).join('/');
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(contentType ? { 'content-type': contentType } : {}),
    ...(method === 'PUT' ? { 'cache-control': 'public, max-age=31536000, immutable' } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map(name => name + ':' + String(headers[name]).trim() + '\n').join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = method.toUpperCase() + '\n' + canonicalUri + '\n\n'
    + canonicalHeaders + signedHeaders + '\n' + payloadHash;
  const scope = dateStamp + '/auto/s3/aws4_request';
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', signingKey(config.secretAccessKey, dateStamp))
    .update(stringToSign).digest('hex');
  const authorization = 'AWS4-HMAC-SHA256 Credential=' + config.accessKeyId + '/' + scope
    + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  const requestHeaders = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: authorization,
    ...(contentType ? { 'Content-Type': contentType } : {}),
    ...(method === 'PUT' ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {}),
  };
  return {
    url: 'https://' + host + canonicalUri,
    headers: requestHeaders,
    body: method === 'PUT' ? payload : undefined,
  };
}

export async function r2Request(method, key, options = {}, env = process.env) {
  const config = options.config ?? getR2Config(env);
  const request = createR2Authorization({
    method,
    key,
    body: options.body ?? Buffer.alloc(0),
    contentType: options.contentType,
    config,
    now: options.now ?? new Date(),
  });
  const response = await fetch(request.url, {
    method,
    headers: request.headers,
    ...(request.body ? { body: request.body } : {}),
  });
  if (!response.ok && !(method === 'DELETE' && response.status === 404)) {
    const detail = (await response.text().catch(() => '')).slice(0, 500);
    throw new Error('Cloudflare R2 respondió ' + response.status + (detail ? ': ' + detail : '.'));
  }
  return response;
}

export async function putR2Object(key, body, contentType = 'image/webp', env = process.env) {
  await r2Request('PUT', key, { body, contentType }, env);
}

export async function deleteR2Object(key, env = process.env) {
  await r2Request('DELETE', key, {}, env);
}
