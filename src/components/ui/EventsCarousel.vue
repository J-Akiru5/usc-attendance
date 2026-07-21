<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { USCEvent } from '@/types/event'

const props = withDefaults(
  defineProps<{ events: USCEvent[]; loading?: boolean; error?: string | null }>(),
  { loading: false, error: null }
)
const router = useRouter()

const scrollRef = ref<HTMLDivElement | null>(null)
const currentIndex = ref(0)
const isPaused = ref(false)

const slideCount = computed(() => props.events.length)

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function scrollTo(index: number) {
  const el = scrollRef.value
  if (!el) return
  const cards = el.children
  if (cards[index]) {
    ;(cards[index] as HTMLElement).scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
      block: 'nearest',
    })
    currentIndex.value = index
  }
}

function scrollPrev() {
  const i = currentIndex.value > 0 ? currentIndex.value - 1 : slideCount.value - 1
  scrollTo(i)
}

function scrollNext() {
  const i = currentIndex.value < slideCount.value - 1 ? currentIndex.value + 1 : 0
  scrollTo(i)
}

let autoId: ReturnType<typeof setInterval> | null = null

function startAuto() {
  stopAuto()
  if (!isPaused.value && slideCount.value > 1) {
    autoId = setInterval(() => {
      const next = currentIndex.value < slideCount.value - 1 ? currentIndex.value + 1 : 0
      scrollTo(next)
    }, 5000)
  }
}

function stopAuto() {
  if (autoId) {
    clearInterval(autoId)
    autoId = null
  }
}

function onHoverEnter() {
  isPaused.value = true
  stopAuto()
}

function onHoverLeave() {
  isPaused.value = false
  startAuto()
}

function onScroll() {
  const el = scrollRef.value
  if (!el) return
  const scrollLeft = el.scrollLeft
  const cardWidth = el.children[0] ? (el.children[0] as HTMLElement).offsetWidth + 20 : 1
  currentIndex.value = Math.round(scrollLeft / cardWidth)
}

onMounted(() => {
  startAuto()
})

onUnmounted(() => {
  stopAuto()
})
</script>

<template>
  <div class="relative" @mouseenter="onHoverEnter" @mouseleave="onHoverLeave" @touchstart="onHoverEnter" @touchend="onHoverLeave">
    <!-- Error state -->
    <div v-if="error && !loading" class="text-center py-12">
      <svg class="w-10 h-10 text-slate/30 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
      </svg>
      <p class="text-sm text-slate mb-2">{{ error }}</p>
      <button @click="() => window.location.reload()" class="text-xs font-semibold text-navy hover:text-gold-dark transition-colors">
        Retry
      </button>
    </div>

    <!-- Skeleton loader -->
    <div v-else-if="loading" class="flex gap-5 overflow-hidden pb-4">
      <div
        v-for="n in 3"
        :key="n"
        class="shrink-0 w-[300px] md:w-[340px] rounded-xl border border-line bg-white overflow-hidden"
      >
        <div class="h-40 bg-navy/5 animate-pulse" />
        <div class="p-5 space-y-3">
          <div class="h-4 bg-navy/5 rounded animate-pulse w-3/4" />
          <div class="space-y-2">
            <div class="h-3 bg-navy/5 rounded animate-pulse w-1/2" />
            <div class="h-3 bg-navy/5 rounded animate-pulse w-2/3" />
          </div>
          <div class="space-y-1.5">
            <div class="h-3 bg-navy/5 rounded animate-pulse w-full" />
            <div class="h-3 bg-navy/5 rounded animate-pulse w-4/5" />
          </div>
          <div class="h-3 bg-navy/5 rounded animate-pulse w-1/3 mt-4" />
        </div>
      </div>
    </div>

    <!-- Carousel content -->
    <template v-else-if="events.length > 0">
      <!-- Arrow buttons (desktop) -->
      <button
        @click="scrollPrev"
        class="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-10 h-10 rounded-full bg-white border border-line shadow-md items-center justify-center text-navy hover:bg-navy hover:text-white hover:border-navy transition-all"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </button>
      <button
        @click="scrollNext"
        class="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-10 h-10 rounded-full bg-white border border-line shadow-md items-center justify-center text-navy hover:bg-navy hover:text-white hover:border-navy transition-all"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>

      <!-- Scrollable track -->
      <div
        ref="scrollRef"
        @scroll="onScroll"
        class="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 scrollbar-hide"
        style="scrollbar-width: none; -ms-overflow-style: none;"
      >
        <div
          v-for="event in events"
          :key="event.id"
          class="snap-start shrink-0 w-[280px] sm:w-[300px] md:w-[340px] rounded-xl border border-line bg-white shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 overflow-hidden flex flex-col"
        >
        <!-- Cover / placeholder -->
        <div class="relative h-40 overflow-hidden">
          <img
            v-if="event.coverImage"
            :src="event.coverImage"
            :alt="event.title"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-navy via-navy/90 to-navy/70 flex items-center justify-center"
          >
            <span class="text-4xl">{{ event.icon || '📅' }}</span>
          </div>
          <!-- Status badge -->
          <div class="absolute top-3 right-3">
            <span
              v-if="event.status === 'completed'"
              class="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200"
            >
              {{ daysAgo(event.date) }}
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              <span class="relative flex h-1.5 w-1.5">
                <span class="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              Upcoming
            </span>
          </div>
        </div>

        <!-- Content -->
        <div class="p-5 flex flex-col flex-1">
          <h3 class="text-sm font-bold text-navy mb-2 leading-snug">{{ event.title }}</h3>

          <div class="space-y-1.5 mb-3">
            <div class="flex items-center gap-1.5 text-xs text-slate">
              <svg class="w-3.5 h-3.5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              {{ formatDate(event.date) }}
            </div>
            <div class="flex items-center gap-1.5 text-xs text-slate">
              <svg class="w-3.5 h-3.5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span class="truncate">{{ event.venue ? `${event.venue}, ${event.location}` : event.location }}</span>
            </div>
          </div>

          <p class="text-xs text-slate leading-relaxed mb-4 line-clamp-2 flex-1">{{ event.description }}</p>

          <div class="flex items-center gap-2 mt-auto">
            <button
              @click="router.push('/events')"
              class="inline-flex items-center gap-1.5 text-xs font-semibold text-navy hover:text-gold-dark transition-colors"
            >
              View Details
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </button>
            <button
              v-if="event.trailerUrl"
              @click="router.push('/events')"
              class="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-dark hover:text-navy transition-colors ml-auto"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Watch
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Dot indicators -->
    <div v-if="!loading && !error && slideCount > 1" class="flex justify-center gap-2 mt-4">
      <button
        v-for="(_, i) in events"
        :key="i"
        @click="scrollTo(i)"
        class="w-2 h-2 rounded-full transition-all duration-300"
        :class="i === currentIndex ? 'bg-navy w-6' : 'bg-navy/20 hover:bg-navy/40'"
      />
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
