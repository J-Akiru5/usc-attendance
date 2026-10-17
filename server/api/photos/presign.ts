import { getMethod } from 'h3'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../utils/http'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
}

// ---------------------------------------------------------------------------
// POST /api/photos/presign
// ---------------------------------------------------------------------------
export default defineApiHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    return respond(event, 405, { error: 'Method not allowed' })
  }

  const user = await authenticate(event)
  requireStaff(user)

  const { fileName, contentType } = await readJsonBody(event) ?? {}
  if (!fileName || !contentType) {
    throw badRequest('Missing required fields: fileName, contentType')
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new HttpError(500, 'R2 storage is not configured')
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
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  })

  const expiresIn = 900 // 15 minutes

  const [fullUploadUrl, thumbUploadUrl] = await Promise.all([
    getSignedUrl(s3, new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fullKey,
      ContentType: contentType
    }), { expiresIn }),
    getSignedUrl(s3, new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: thumbKey,
      ContentType: contentType
    }), { expiresIn })
  ])

  return {
    fullKey,
    thumbKey,
    fullUploadUrl,
    thumbUploadUrl
  }
})
