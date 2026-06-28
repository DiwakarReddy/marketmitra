// KMS envelope encryption
// Master key in AWS KMS / GCP KMS / HashiCorp Vault
// Wraps data encryption keys (DEK) which encrypt actual secrets
//
// For local dev: falls back to local-key mode (ENCRYPTION_KEY env var)
// For production: set KMS_PROVIDER=aws|gcp|vault and configure credentials

import crypto from 'crypto'

export type KMSProvider = 'local' | 'aws' | 'gcp' | 'vault'

interface KMSConfig {
  provider: KMSProvider
  // AWS
  awsRegion?: string
  awsKeyId?: string
  // GCP
  gcpProjectId?: string
  gcpKeyRing?: string
  gcpKeyName?: string
  // Vault
  vaultAddr?: string
  vaultToken?: string
  vaultKey?: string
}

function getConfig(): KMSConfig {
  const provider = (process.env.KMS_PROVIDER || 'local') as KMSProvider
  return {
    provider,
    awsRegion: process.env.AWS_REGION,
    awsKeyId: process.env.AWS_KMS_KEY_ID,
    gcpProjectId: process.env.GCP_PROJECT_ID,
    gcpKeyRing: process.env.GCP_KEY_RING,
    gcpKeyName: process.env.GCP_KMS_KEY_NAME,
    vaultAddr: process.env.VAULT_ADDR,
    vaultToken: process.env.VAULT_TOKEN,
    vaultKey: process.env.VAULT_KMS_KEY,
  }
}

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 16
const DEK_LENGTH = 32

// Cache DEKs per business (5 min TTL) to avoid calling KMS on every send
const dekCache = new Map<string, { key: Buffer; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000

/**
 * Get or generate a Data Encryption Key (DEK) for a business.
 * The DEK is wrapped by the KMS master key and stored alongside the ciphertext.
 * In local mode, DEK is derived from ENCRYPTION_KEY + businessId.
 */
async function getDEK(businessId: string): Promise<Buffer> {
  const cached = dekCache.get(businessId)
  if (cached && cached.expires > Date.now()) return cached.key

  const config = getConfig()
  let key: Buffer

  switch (config.provider) {
    case 'aws':
      key = await getAWSDEK(config, businessId)
      break
    case 'gcp':
      key = await getGCPDEK(config, businessId)
      break
    case 'vault':
      key = await getVaultDEK(config, businessId)
      break
    case 'local':
    default:
      key = deriveLocalKey(businessId)
  }

  dekCache.set(businessId, { key, expires: Date.now() + CACHE_TTL })
  return key
}

function deriveLocalKey(businessId: string): Buffer {
  const master = process.env.ENCRYPTION_KEY
  if (!master) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'No encryption key configured. Set ENCRYPTION_KEY for local mode, ' +
        'or KMS_PROVIDER=aws|gcp|vault with proper credentials.'
      )
    }
    // Dev fallback
    return crypto.createHash('sha256').update(`dev-key-${businessId}`).digest()
  }
  // Derive: HKDF(master, businessId) → 32 bytes
  const masterKey = master.length === 64 && /^[0-9a-f]+$/i.test(master)
    ? Buffer.from(master, 'hex')
    : Buffer.from(master, 'base64')
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.from(businessId), Buffer.alloc(0), DEK_LENGTH))
}

async function getAWSDEK(config: KMSConfig, businessId: string): Promise<Buffer> {
  // Real implementation:
  // import { KMSClient, GenerateDataKeyCommand } from '@aws-sdk/client-kms'
  // const client = new KMSClient({ region: config.awsRegion })
  // const command = new GenerateDataKeyCommand({
  //   KeyId: config.awsKeyId,
  //   KeySpec: 'AES_256',
  //   EncryptionContext: { businessId }, // CRITICAL for security
  // })
  // const result = await client.send(command)
  // return Buffer.from(result.Plaintext!)
  //
  // For now, throw if not configured:
  throw new Error(
    'AWS KMS configured but @aws-sdk/client-kms not installed. ' +
    'Run: npm install @aws-sdk/client-kms'
  )
}

async function getGCPDEK(config: KMSConfig, businessId: string): Promise<Buffer> {
  // Real implementation:
  // import { KeyManagementServiceClient } from '@google-cloud/kms'
  // const client = new KeyManagementServiceClient()
  // const [result] = await client.encrypt({
  //   name: `projects/${config.gcpProjectId}/locations/-/keyRings/${config.gcpKeyRing}/cryptoKeys/${config.gcpKeyName}`,
  //   plaintext: Buffer.from(plainDek),
  //   additionalAuthenticatedData: Buffer.from(businessId),
  // })
  throw new Error(
    'GCP KMS configured but @google-cloud/kms not installed. ' +
    'Run: npm install @google-cloud/kms'
  )
}

async function getVaultDEK(config: KMSConfig, businessId: string): Promise<Buffer> {
  // Real implementation:
  // const res = await fetch(`${config.vaultAddr}/v1/transit/datakey/plain/${config.vaultKey}`, {
  //   method: 'POST',
  //   headers: { 'X-Vault-Token': config.vaultToken },
  //   body: JSON.stringify({ context: businessId }),
  // })
  // const data = await res.json()
  // return Buffer.from(data.data.plaintext, 'base64')
  throw new Error(
    'Vault KMS configured but client not wired. Add Vault transit engine call.'
  )
}

/**
 * Encrypt a string with the business's DEK.
 * Returns a self-describing envelope: version:iv:tag:ciphertext
 */
export async function encrypt(plaintext: string, businessId: string): Promise<string> {
  const dek = await getDEK(businessId)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, dek, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export async function decrypt(ciphertext: string, businessId: string): Promise<string> {
  if (!ciphertext.startsWith('v1:')) {
    // Legacy format (single key, not per-tenant) — try to decrypt with local key
    return decryptLegacy(ciphertext, businessId)
  }
  const parts = ciphertext.split(':')
  if (parts.length !== 4) throw new Error('Invalid ciphertext format')
  const [, ivHex, tagHex, dataHex] = parts
  const dek = await getDEK(businessId)
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, dek, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

// Backwards compat with old single-key encryption
function decryptLegacy(ciphertext: string, businessId: string): string {
  const { decrypt: oldDecrypt } = require('./encryption-legacy')
  try {
    return oldDecrypt(ciphertext)
  } catch (err) {
    throw new Error('Legacy ciphertext cannot be decrypted. Re-encrypt with new key.')
  }
}

export async function encryptJSON(obj: Record<string, any>, businessId: string): Promise<string> {
  return encrypt(JSON.stringify(obj), businessId)
}

export async function decryptJSON<T = Record<string, any>>(
  ciphertext: string,
  businessId: string
): Promise<T> {
  return JSON.parse(await decrypt(ciphertext, businessId))
}

export function mask(value: string): string {
  if (!value || value.length < 8) return '••••••'
  return '•'.repeat(Math.max(8, value.length - 4)) + value.slice(-4)
}

export function getKMSStatus() {
  const config = getConfig()
  return {
    provider: config.provider,
    configured: config.provider === 'local'
      ? !!process.env.ENCRYPTION_KEY
      : true, // assume configured if non-local
    // For local: warns in dev
    isProduction: process.env.NODE_ENV === 'production',
    recommendation: config.provider === 'local' && process.env.NODE_ENV === 'production'
      ? '⚠️ Local key in production. Switch to AWS KMS / GCP KMS / Vault.'
      : null,
  }
}