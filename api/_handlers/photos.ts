import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { prisma } from '../_lib/prisma.js'
import { authenticate, requireStaff } from '../_lib/auth.js'
import { badRequest, handle, HttpError } from '../_lib/http.js'

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

// ---------------------------------------------------------------------------
// GET/POST /api/photos
// ---------------------------------------------------------------------------
export const photos = handle(async (req: VercelRequest, res: VercelResponse) => {
  // GET: public — list photos for an event with cursor pagination
  if (req.method === 'GET') {
    const eventSlug = req.query.eventSlug as string
    if (!eventSlug) {
      throw badRequest('Missing required query param: eventSlug')
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 24, 1), 100)
    const cursor = req.query.cursor as string | undefined

    const photosList = await prisma.photo.findMany({
      where: { eventSlug },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = photosList.length > limit
    const data = hasMore ? photosList.slice(0, limit) : photosList
    const nextCursor = hasMore ? data[data.length - 1].id : null

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return res.status(200).json({ data, nextCursor })
  }

  const user = await authenticate(req)

  if (req.method === 'POST') {
    requireStaff(user)

    const { eventSlug, storageKeyFull, storageKeyThumb } = req.body
    if (!eventSlug || !storageKeyFull || !storageKeyThumb) {
      throw badRequest('Missing required fields: eventSlug, storageKeyFull, storageKeyThumb')
    }

    const photo = await prisma.photo.create({
      data: {
        eventSlug,
        storageKeyFull,
        storageKeyThumb,
        uploadedBy: user.id,
      },
    })

    return res.status(201).json(photo)
  }

  return res.status(405).json({ error: 'Method not allowed' })
})

// ---------------------------------------------------------------------------
// POST /api/photos/presign
// ---------------------------------------------------------------------------
export const presign = handle(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await authenticate(req)
  requireStaff(user)

  const { fileName, contentType } = req.body
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
})
