import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { authenticate, requireStaff } from '../_lib/auth.js'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticate(req)
    requireStaff(user)

    const { fileName, contentType } = req.body
    if (!fileName || !contentType) {
      return res.status(400).json({ error: 'Missing required fields: fileName, contentType' })
    }

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      return res.status(500).json({ error: 'R2 storage is not configured' })
    }

    const ext = MIME_TO_EXT[contentType] || ''
    const photoId = randomUUID()

    const fullKey = `${photoId}/full${ext ? `.${ext}` : ''}`
    const thumbKey = `${photoId}/thumb${ext ? `.${ext}` : ''}`

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })

    const expiresIn = 900 // 15 minutes

    const [fullUploadUrl, thumbUploadUrl] = await Promise.all([
      getSignedUrl(s3, new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fullKey,
        ContentType: contentType,
      }), { expiresIn }),
      getSignedUrl(s3, new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: thumbKey,
        ContentType: contentType,
      }), { expiresIn }),
    ])

    return res.status(200).json({
      fullKey,
      thumbKey,
      fullUploadUrl,
      thumbUploadUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    const status = message.includes('Access denied') ? 403 : 500
    return res.status(status).json({ error: message })
  }
}
