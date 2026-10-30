/// <reference types="node" />

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  publicUrl: URL;
}

export function getR2Config(env?: NodeJS.ProcessEnv): R2Config;
export function sha256Hex(value: Uint8Array | string): string;
export function isWebpBuffer(value: Uint8Array): boolean;
export function imageObjectKey(hash: string): string;
export function imagePublicUrl(publicBaseUrl: string, key: string): string;
export function parseManagedImageUrl(value: string, config?: R2Config): { hash: string; key: string } | null;
export function createR2Authorization(options: {
  method: string;
  key: string;
  body?: Uint8Array;
  contentType?: string;
  config: R2Config;
  now?: Date;
}): Promise<{ url: string; headers: Record<string, string>; body?: Buffer }>;
export function r2Request(method: string, key: string, options?: {
  body?: Uint8Array;
  contentType?: string;
  config?: R2Config;
  now?: Date;
}, env?: NodeJS.ProcessEnv): Promise<Response>;
export function putR2Object(key: string, body: Uint8Array, contentType?: string, env?: NodeJS.ProcessEnv): Promise<void>;
export function deleteR2Object(key: string, env?: NodeJS.ProcessEnv): Promise<void>;
