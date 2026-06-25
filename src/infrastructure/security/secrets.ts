import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getSecretsDir } from "@/infrastructure/config/paths";

type SecretEnvelope = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  encrypted: string;
  masked: string;
  createdAt: string;
};

/**
 * In-memory LRU cache for decrypted secrets.
 * Avoids repeated fs.readFile + AES-256-GCM decryption for the same key.
 * TTL: 5 minutes; LRU max: 100 entries.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const secretCache = new Map<string, CacheEntry>();

function cacheGet(ref: string): string | undefined {
  const entry = secretCache.get(ref);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    secretCache.delete(ref);
    return undefined;
  }
  return entry.value;
}

function cacheSet(ref: string, value: string): void {
  if (secretCache.size >= CACHE_MAX) {
    const firstKey = secretCache.keys().next().value;
    if (firstKey !== undefined) secretCache.delete(firstKey);
  }
  secretCache.set(ref, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheInvalidate(ref?: string): void {
  if (ref) {
    secretCache.delete(ref);
  } else {
    secretCache.clear();
  }
}

function getEncryptionKey(): Buffer {
  const configured = process.env.POST_GENERATOR_SECRET_KEY;
  if (configured) {
    const normalized = configured.trim();
    if (/^[a-f0-9]{64}$/i.test(normalized)) {
      return Buffer.from(normalized, "hex");
    }
    return crypto.createHash("sha256").update(normalized).digest();
  }

  return crypto
    .createHash("sha256")
    .update(`post-generator-dev-key:${os.userInfo().username}:${os.homedir()}`)
    .digest();
}

function secretPath(ref: string): string {
  const safe = ref.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(getSecretsDir(), `${safe}.json`);
}

export function maskSecret(secret: string): string {
  if (!secret) return "";
  const head = secret.slice(0, Math.min(7, secret.length));
  const tail = secret.slice(-4);
  return `${head}****${tail}`;
}

export async function saveSecret(secret: string, existingRef?: string): Promise<{ ref: string; masked: string }> {
  if (existingRef) cacheInvalidate(existingRef);
  await fs.mkdir(getSecretsDir(), { recursive: true });
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ref = existingRef || `secret_${crypto.randomUUID()}`;
  const envelope: SecretEnvelope = {
    version: 1, algorithm: "aes-256-gcm",
    iv: iv.toString("base64"), authTag: authTag.toString("base64"),
    encrypted: encrypted.toString("base64"), masked: maskSecret(secret),
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(secretPath(ref), JSON.stringify(envelope, null, 2), { mode: 0o600 });
  return { ref, masked: envelope.masked };
}

export async function readSecret(ref?: string): Promise<string | undefined> {
  if (!ref) return undefined;
  const cached = cacheGet(ref);
  if (cached !== undefined) return cached;
  let raw: string;
  try {
    raw = await fs.readFile(secretPath(ref), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const envelope = JSON.parse(raw) as SecretEnvelope;
  const decipher = crypto.createDecipheriv(envelope.algorithm, getEncryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
  cacheSet(ref, decrypted);
  return decrypted;
}

export async function deleteSecret(ref?: string): Promise<void> {
  if (!ref) return;
  cacheInvalidate(ref);
  try {
    await fs.unlink(secretPath(ref));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}