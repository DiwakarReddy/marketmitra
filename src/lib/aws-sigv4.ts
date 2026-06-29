// AWS Signature V4 implementation for SES v2 REST API.
// Self-contained — uses only Node's built-in `crypto`. No AWS SDK required.
//
// Why hand-rolled: keeps the email lib dependency-free. We use this for
// SES; Resend (the recommended path) doesn't need it.

import crypto from 'crypto'

export interface SignRequestInput {
  method: string
  url: string
  body: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  /** Optional pre-existing headers; we add Host, X-Amz-Date, Authorization */
  extraHeaders?: Record<string, string>
}

export interface SignRequestOutput {
  url: string
  headers: Record<string, string>
  body: string
}

export function signRequest(input: SignRequestInput): SignRequestOutput {
  const { method, url, body, region, service, accessKeyId, secretAccessKey } = input
  const u = new URL(url)

  // 1. Timestamp
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8)

  // 2. Canonical request
  const headers: Record<string, string> = {
    host: u.host,
    'x-amz-date': amzDate,
    'content-type': 'application/json',
    ...(input.extraHeaders || {}),
  }
  // Lowercase all header keys
  const sortedHeaderKeys = Object.keys(headers).map((k) => k.toLowerCase()).sort()
  const canonicalHeaders = sortedHeaderKeys.map((k) => {
    const v = Object.entries(headers).find(([hk]) => hk.toLowerCase() === k)?.[1] || ''
    return `${k}:${v.trim()}\n`
  }).join('')
  const signedHeaders = sortedHeaderKeys.join(';')

  // Query string: only sort existing query params
  const sortedQuery = Array.from(u.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const payloadHash = crypto.createHash('sha256').update(body, 'utf-8').digest('hex')

  const canonicalRequest = [
    method.toUpperCase(),
    u.pathname || '/',
    sortedQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  // 3. String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf-8').digest('hex'),
  ].join('\n')

  // 4. Signing key
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, 'aws4_request')

  // 5. Signature
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf-8').digest('hex')

  // 6. Authorization header
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    url: u.toString(),
    headers: {
      ...headers,
      'Authorization': authorization,
    },
    body,
  }
}

function hmac(key: crypto.BinaryLike | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf-8').digest()
}
