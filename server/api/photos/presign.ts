import { getMethod } from 'h3'
import { randomUUID } from 'crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { authenticate, requireStaff } from '../../utils/auth'
import { badRequest, defineApiHandler, HttpError, readJsonBody, respond } from '../../utils/http'
import { r2Client, r2Config } from '../../utils/r2'

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

  const config = r2Config()
  if (!config) {
    throw new HttpError(500, 'R2 storage is not configured')
  }

  const ext = MIME_TO_EXT[contentType] || ''
  const photoId = randomUUID()

  const fullKey = `${photoId}/full${ext ? `.${ext}` : ''}`
  const thumbKey = `${photoId}/thumb${ext ? `.${ext}` : ''}`

  const s3 = r2Client(config)

  const expiresIn = 900 // 15 minutes

  const [fullUploadUrl, thumbUploadUrl] = await Promise.all([
    getSignedUrl(s3, new PutObjectCommand({
      Bucket: config.bucket,
      Key: fullKey,
      ContentType: contentType
    }), { expiresIn }),
    getSignedUrl(s3, new PutObjectCommand({
      Bucket: config.bucket,
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
