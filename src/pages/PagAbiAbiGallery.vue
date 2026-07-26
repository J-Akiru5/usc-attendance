<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const LAUNCH_TIME = new Date('2026-07-27T21:00:00+08:00').getTime()

interface PhotoRecord {
  id: string
  eventSlug: string
  storageKeyFull: string
  storageKeyThumb: string
  batchTag: string | null
  studentTag: string | null
  uploadedBy: string
  createdAt: string
}

const R2_BASE = import.meta.env.VITE_R2_PUBLIC_URL

if (!R2_BASE) {
  console.error('Configuration error: VITE_R2_PUBLIC_URL environment variable is not set. The gallery cannot render images.')
}
const r2Configured = !!R2_BASE

function photoThumbUrl(photo: PhotoRecord): string {
  return `${R2_BASE}/${photo.storageKeyThumb}`
}

function photoFullUrl(photo: PhotoRecord): string {
  return `${R2_BASE}/${photo.storageKeyFull}`
}

const now = ref(Date.now())
const photos = ref<PhotoRecord[]>([])
const loading = ref(true)
const lightboxIndex = ref<number | null>(null)

let timer: ReturnType<typeof setInterval> | null = null

const isUnlocked = computed(() => now.value >= LAUNCH_TIME)

const countdown = computed(() => {
  const diff = LAUNCH_TIME - now.value
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
})

const pad = (n: number) => String(n).padStart(2, '0')

const lightboxSrc = computed(() => {
  if (lightboxIndex.value === null || !photos.value[lightboxIndex.value]) return ''
  return photoFullUrl(photos.value[lightboxIndex.value])
})

function openLightbox(index: number) {
  lightboxIndex.value = index
}

function closeLightbox() {
  lightboxIndex.value = null
}

function prevPhoto() {
  if (lightboxIndex.value === null) return
  lightboxIndex.value = lightboxIndex.value > 0 ? lightboxIndex.value - 1 : photos.value.length - 1
}

function nextPhoto() {
  if (lightboxIndex.value === null) return
  lightboxIndex.value = lightboxIndex.value < photos.value.length - 1 ? lightboxIndex.value + 1 : 0
}

function onKeydown(e: KeyboardEvent) {
  if (lightboxIndex.value === null) return
  if (e.key === 'Escape') closeLightbox()
  else if (e.key === 'ArrowLeft') prevPhoto()
  else if (e.key === 'ArrowRight') nextPhoto()
}

function downloadPhoto(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = url.split('/').pop() || 'photo.jpg'
  a.click()
}

async function fetchPhotos() {
  loading.value = true
  try {
    const res = await fetch('/api/photos?eventSlug=pag-abi-abi-2026')
    if (!res.ok) throw new Error('Failed to load photos')
    photos.value = await res.json()
  } catch {
    photos.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  document.addEventListener('keydown', onKeydown)
  if (isUnlocked.value) fetchPhotos()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative bg-[#0B132B] text-white py-16 md:py-20 overflow-hidden">
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="
          background-image:
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
          background-size: 40px 40px;
        "
      />
      <div class="relative px-4 md:px-12 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Pag-Abi-Abi 2026</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Photo Booth Gallery</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Captured moments from the Pag-Abi-Abi celebration photo booth experience.
        </p>
      </div>
    </section>

    <!-- Countdown -->
    <section v-if="!isUnlocked" class="py-20 md:py-28 bg-paper">
      <div class="px-4 md:px-12 text-center">
        <div class="inline-flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-full px-5 py-2 mb-6">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-gold" />
          </span>
          <span class="text-sm font-mono uppercase tracking-wider text-gold">Coming Soon</span>
        </div>

        <p class="text-navy/70 mb-8 max-w-lg mx-auto">
          Photos are currently being uploaded and processed.
        </p>

        <div class="flex items-center justify-center gap-3 sm:gap-4 mb-8">
          <div class="bg-[#0B132B] rounded-xl px-4 py-3 sm:px-6 sm:py-4 min-w-[72px] sm:min-w-[88px]">
            <div class="text-2xl sm:text-3xl font-bold font-mono text-gold tabular-nums">{{ pad(countdown.days) }}</div>
            <div class="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider mt-1">Days</div>
          </div>
          <span class="text-gold/40 text-xl font-bold">:</span>
          <div class="bg-[#0B132B] rounded-xl px-4 py-3 sm:px-6 sm:py-4 min-w-[72px] sm:min-w-[88px]">
            <div class="text-2xl sm:text-3xl font-bold font-mono text-gold tabular-nums">{{ pad(countdown.hours) }}</div>
            <div class="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider mt-1">Hours</div>
          </div>
          <span class="text-gold/40 text-xl font-bold">:</span>
          <div class="bg-[#0B132B] rounded-xl px-4 py-3 sm:px-6 sm:py-4 min-w-[72px] sm:min-w-[88px]">
            <div class="text-2xl sm:text-3xl font-bold font-mono text-gold tabular-nums">{{ pad(countdown.minutes) }}</div>
            <div class="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider mt-1">Minutes</div>
          </div>
          <span class="text-gold/40 text-xl font-bold">:</span>
          <div class="bg-[#0B132B] rounded-xl px-4 py-3 sm:px-6 sm:py-4 min-w-[72px] sm:min-w-[88px]">
            <div class="text-2xl sm:text-3xl font-bold font-mono text-gold tabular-nums">{{ pad(countdown.seconds) }}</div>
            <div class="text-[10px] sm:text-xs text-white/40 uppercase tracking-wider mt-1">Seconds</div>
          </div>
        </div>

        <p class="text-sm text-navy/50 font-mono">
          Gallery opens July 27, 2026 at 9:00 PM
        </p>
      </div>
    </section>

    <!-- Gallery -->
    <section v-else class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <!-- Config error -->
        <div v-if="!r2Configured" class="text-center py-20">
          <div class="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-full px-5 py-2 mb-4">
            <span class="text-sm font-mono uppercase tracking-wider text-red-600">Gallery is not configured</span>
          </div>
          <p class="text-navy/50 text-sm">Please set the VITE_R2_PUBLIC_URL environment variable.</p>
        </div>

        <!-- Loading -->
        <div v-else-if="loading" class="text-center py-20">
          <div class="inline-flex items-center gap-2 text-gold">
            <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span class="text-sm font-mono uppercase tracking-wider">Loading photos...</span>
          </div>
        </div>

        <!-- Empty -->
        <div v-else-if="photos.length === 0" class="text-center py-20">
          <div class="inline-flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-full px-5 py-2 mb-4">
            <span class="text-sm font-mono uppercase tracking-wider text-gold">No photos yet</span>
          </div>
          <p class="text-navy/50 text-sm">Photos will appear here once uploaded.</p>
        </div>

        <!-- Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          <div
            v-for="(photo, index) in photos"
            :key="photo.id"
            class="group relative rounded-xl overflow-hidden border border-line bg-white shadow-sm hover:shadow-lg transition-all cursor-pointer"
            @click="openLightbox(index)"
          >
            <div class="aspect-square overflow-hidden">
              <img
                :src="photoThumbUrl(photo)"
                :alt="`Photo ${index + 1}`"
                class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>
            <button
              class="absolute bottom-2 right-2 bg-[#0B132B]/80 backdrop-blur-sm text-white text-[10px] font-mono uppercase tracking-wider px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gold hover:text-[#0B132B]"
              @click.stop="downloadPhoto(photoFullUrl(photo))"
            >
              Download HD
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Lightbox -->
    <Teleport to="body">
      <div
        v-if="lightboxIndex !== null"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
        @click.self="closeLightbox"
      >
        <!-- Close -->
        <button
          class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          @click="closeLightbox"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <!-- Prev -->
        <button
          class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          @click="prevPhoto"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Next -->
        <button
          class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          @click="nextPhoto"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <!-- Image -->
        <div class="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-4">
          <img
            :src="lightboxSrc"
            :alt="`Photo ${(lightboxIndex ?? 0) + 1}`"
            class="max-w-full max-h-[75vh] object-contain rounded-lg"
          />
          <div class="flex items-center gap-3">
            <span class="text-white/50 text-sm font-mono">{{ (lightboxIndex ?? 0) + 1 }} / {{ photos.length }}</span>
            <button
              class="bg-gold text-[#0B132B] text-xs font-bold font-mono uppercase tracking-wider px-4 py-2 rounded-lg hover:bg-gold/90 transition-colors"
              @click="downloadPhoto(lightboxSrc)"
            >
              Download HD Photo
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
