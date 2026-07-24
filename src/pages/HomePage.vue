<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { officers } from '@/data/officers'
import { projects } from '@/data/projects'
import { useEvents } from '@/composables/useEvents'
import EventsCarousel from '@/components/ui/EventsCarousel.vue'

const router = useRouter()
const { events, loading: eventsLoading, error: eventsError, featuredEvent } = useEvents()

const showSpotlight = computed(() => {
  return featuredEvent.value && featuredEvent.value.status === 'upcoming'
})

const countdown = ref({ days: 0, hours: 0, minutes: 0, seconds: 0 })
const eventStarted = ref(false)

function computeCountdown() {
  if (!featuredEvent.value) return
  const now = new Date()
  const target = new Date(featuredEvent.value.date)
  const diff = target.getTime() - now.getTime()

  if (diff <= 0) {
    eventStarted.value = true
    countdown.value = { days: 0, hours: 0, minutes: 0, seconds: 0 }
    return
  }

  eventStarted.value = false
  countdown.value = {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

watch(showSpotlight, (active) => {
  if (active) {
    computeCountdown()
    intervalId = setInterval(computeCountdown, 1000)
  } else if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}, { immediate: true })

const nextEvent = computed(() => {
  const upcoming = (events.value || []).filter(e => e.status === 'upcoming')
  if (upcoming.length === 0) return null
  return [...upcoming].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
})

const nextEventCountdown = ref({ days: 0, hours: 0, minutes: 0, seconds: 0 })
const nextEventStarted = ref(false)

function computeNextEventCountdown() {
  if (!nextEvent.value) return
  const now = new Date()
  const target = new Date(nextEvent.value.date)
  const diff = target.getTime() - now.getTime()

  if (diff <= 0) {
    nextEventStarted.value = true
    nextEventCountdown.value = { days: 0, hours: 0, minutes: 0, seconds: 0 }
    return
  }

  nextEventStarted.value = false
  nextEventCountdown.value = {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

let nextEventIntervalId: ReturnType<typeof setInterval> | null = null

watch(nextEvent, (event) => {
  if (event) {
    computeNextEventCountdown()
    if (!nextEventIntervalId) {
      nextEventIntervalId = setInterval(computeNextEventCountdown, 1000)
    }
  } else if (nextEventIntervalId) {
    clearInterval(nextEventIntervalId)
    nextEventIntervalId = null
  }
}, { immediate: true })

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
  if (nextEventIntervalId) clearInterval(nextEventIntervalId)
})

const executiveOfficers = officers.filter(o => o.tier === 'usc_executive').slice(0, 4)
const previewProjects = projects.slice(0, 3)
const previewEvents = computed(() => (events.value || []).slice(0, 3))

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInitials(name?: string) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(p => !p.endsWith('.'))
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const logos = [
  '/webp/isufst_logo.webp',
  '/webp/1.webp',
  '/webp/2.webp',
  '/webp/3.webp',
  '/webp/4.webp',
  '/webp/5.webp',
  '/webp/6.webp',
  '/webp/7.webp',
  '/webp/8.webp',
  '/webp/9.webp'
]
</script>

<template>
  <div>
    <!-- ========== HERO ========== -->
    <section class="relative text-white overflow-hidden min-h-[580px] flex items-center">
      <div
        class="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style="background-image: url('/isufst.webp');"
      />
      <div class="absolute inset-0 bg-navy/60" />
      <div
        class="absolute inset-0"
        style="background: linear-gradient(100deg, rgba(12,27,54,0.98) 0%, rgba(12,27,54,0.92) 30%, rgba(12,27,54,0.65) 55%, rgba(12,27,54,0.15) 100%);"
      />
      <div
        class="absolute inset-x-0 bottom-0 h-40"
        style="background: linear-gradient(to top, rgba(12,27,54,0.85) 0%, transparent 100%);"
      />
      <div
        class="absolute inset-x-0 top-0 h-20"
        style="background: linear-gradient(to bottom, rgba(12,27,54,0.6) 0%, transparent 100%);"
      />

      <div class="relative px-4 md:px-12 py-20 md:py-28 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div class="lg:col-span-7">
          <!-- Mini Event Countdown Widget -->
          <div
            v-if="nextEvent && !nextEventStarted"
            v-motion
            :initial="{ opacity: 0, y: -20 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 50 } }"
            class="inline-flex flex-wrap items-center gap-3.5 p-2.5 px-4 bg-navy/80 backdrop-blur-md border border-white/10 rounded-xl mb-6 shadow-2xl select-none"
          >
            <div class="flex items-center gap-2.5">
              <span class="text-xl shrink-0">{{ nextEvent.icon || '📅' }}</span>
              <div>
                <div class="text-[9px] font-mono text-white/50 uppercase tracking-widest leading-none flex items-center gap-1.5 mb-0.5">
                  <span class="relative flex h-1.5 w-1.5">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-gold"></span>
                  </span>
                  Next Event
                </div>
                <div class="text-xs font-bold text-white truncate max-w-[130px] sm:max-w-[180px]">{{ nextEvent.title }}</div>
              </div>
            </div>
            <div class="hidden sm:block h-6 w-px bg-white/10"></div>
            <div class="flex items-center gap-3.5">
              <div class="flex items-center gap-1 font-mono text-xs text-gold">
                <span class="font-bold">{{ String(nextEventCountdown.days).padStart(2, '0') }}d</span>
                <span class="text-white/30">:</span>
                <span class="font-bold">{{ String(nextEventCountdown.hours).padStart(2, '0') }}h</span>
                <span class="text-white/30">:</span>
                <span class="font-bold">{{ String(nextEventCountdown.minutes).padStart(2, '0') }}m</span>
              </div>
              <button
                @click="router.push('/events')"
                class="px-3 py-1 text-[10px] font-bold text-navy bg-gold hover:brightness-110 active:scale-95 transition-all rounded-md"
              >
                View Details
              </button>
            </div>
          </div>

          <div
            v-motion
            :initial="{ opacity: 0, x: -40 }"
            :enter="{ opacity: 1, x: 0, transition: { duration: 0.5, delay: 100 } }"
            class="text-xs font-mono uppercase tracking-widest text-gold mb-5 flex flex-wrap items-center gap-2"
          >
            <span>ISUFST Dingle Campus</span>
            <span class="text-white/30">•</span>
            <span class="text-white/60">A.Y. 2026-2027</span>
          </div>

          <h1
            v-motion
            :initial="{ opacity: 0, y: 40 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 0.6, delay: 200 } }"
            class="text-4xl md:text-5xl lg:text-[3.75rem] font-bold font-serif leading-tight mb-3 drop-shadow-lg"
          >
            University Student<br>Council
          </h1>

          <p
            v-motion
            :initial="{ opacity: 0 }"
            :enter="{ opacity: 1, transition: { duration: 0.5, delay: 300 } }"
            class="text-white/50 text-sm font-mono uppercase tracking-wider mb-5"
          >
            Official Website
          </p>

          <p
            v-motion
            :initial="{ opacity: 0, y: 20 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 400 } }"
            class="text-white/80 text-base md:text-lg leading-relaxed mb-10 max-w-xl"
          >
            Serving students. Leading change. Building community.<br>
            The official digital presence of the University Student Council.
          </p>

          <div
            v-motion
            :initial="{ opacity: 0, y: 20 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 500 } }"
            class="flex flex-wrap gap-3"
          >
            <button
              @click="router.push('/portal')"
              class="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-xl shadow-black/30 hover:brightness-110 transition-all"
            >
              Officer Portal
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </button>
            <button
              @click="router.push('/about')"
              class="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-white/40 bg-white/5 backdrop-blur-sm text-white font-medium text-sm hover:bg-white/15 hover:border-white/60 transition-all"
            >
              Learn More
            </button>
          </div>
        </div>

        <div class="lg:col-span-5 flex justify-center lg:justify-end">
          <div class="relative group">
            <div class="absolute inset-4 rounded-full bg-gold/15 blur-3xl group-hover:bg-gold/25 transition duration-1000"></div>
            <img
              v-motion
              :initial="{ opacity: 0, scale: 0.8 }"
              :enter="{ opacity: 1, scale: 1, transition: { duration: 0.7, delay: 300 } }"
              src="/gif/usc%20logo%20animation.gif"
              alt="USC Logo Animation"
              class="relative w-80 h-80 sm:w-[26rem] sm:h-[26rem] lg:w-[32rem] lg:h-[32rem] object-contain select-none pointer-events-none drop-shadow-[0_0_35px_rgba(201,162,75,0.2)] hover:scale-105 transition-transform duration-500 animate-float"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- ========== LOGO CAROUSEL ========== -->
    <section class="py-8 bg-navy-deep border-y border-white/5 overflow-hidden relative">
      <div class="px-4 md:px-12">
        <div class="relative w-full overflow-hidden whitespace-nowrap [mask-image:_linear-gradient(to_right,_transparent_0,_black_15%,_black_85%,_transparent_100%)]">
          <div class="inline-flex gap-16 md:gap-24 animate-marquee py-2">
            <div v-for="logo in logos" :key="logo" class="flex items-center justify-center h-16 w-16 md:h-20 md:w-20 shrink-0 bg-white/5 backdrop-blur-sm rounded-xl p-2 border border-white/10 hover:border-gold/30 hover:bg-white/10 transition-all duration-300 shadow-lg">
              <img :src="logo" alt="Logo" class="max-h-full max-w-full object-contain filter brightness-90 hover:brightness-110 hover:scale-105 transition-all duration-300 select-none pointer-events-none" />
            </div>
            <div v-for="logo in logos" :key="logo + '-dup'" class="flex items-center justify-center h-16 w-16 md:h-20 md:w-20 shrink-0 bg-white/5 backdrop-blur-sm rounded-xl p-2 border border-white/10 hover:border-gold/30 hover:bg-white/10 transition-all duration-300 shadow-lg">
              <img :src="logo" alt="Logo" class="max-h-full max-w-full object-contain filter brightness-90 hover:brightness-110 hover:scale-105 transition-all duration-300 select-none pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== ABOUT PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="px-4 md:px-12">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div
            v-motion
            :initial="{ opacity: 0, x: -40 }"
            :enter="{ opacity: 1, x: 0, transition: { duration: 0.5 } }"
          >
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Who We Are</div>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-navy mb-6">
              Serving Students.<br>Leading Change.
            </h2>
            <p class="text-slate leading-relaxed mb-4">
              The University Student Council is the official student governing body of ISUFST Dingle Campus. We represent the student body, organize programs, and advocate for student welfare.
            </p>
            <p class="text-slate leading-relaxed mb-8">
              Through leadership, service, and collaboration, the USC works to create a vibrant and inclusive campus community for all students.
            </p>
            <router-link
              to="/about"
              class="inline-flex items-center gap-2 text-sm font-semibold text-navy hover:text-gold-dark transition-colors"
            >
              About the Council
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </router-link>
          </div>

          <div
            v-motion
            :initial="{ opacity: 0, x: 40 }"
            :enter="{ opacity: 1, x: 0, transition: { duration: 0.5, delay: 100 } }"
            class="rounded-2xl border border-line bg-paper-panel shadow-lg overflow-hidden"
          >
            <div class="bg-navy px-4 py-3 flex items-center gap-2">
              <div class="flex gap-1.5">
                <div class="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              </div>
              <div class="ml-2 text-[10px] font-mono text-white/40 uppercase tracking-wider">About the Council</div>
            </div>
            <div class="p-6">
              <div class="flex items-center gap-3 mb-5 pb-4 border-b border-line">
                <img src="/logo/USC_logo.webp" alt="USC Logo" class="w-10 h-10 rounded-full object-cover border border-gold/40 shrink-0" />
                <div>
                  <div class="text-sm font-bold text-navy">University Student Council</div>
                  <div class="text-[10px] text-slate font-mono">ISUFST Dingle Campus</div>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-navy/5 rounded-xl p-4 text-center border border-line/50">
                  <div class="text-2xl font-bold text-navy font-serif">14</div>
                  <div class="text-xs text-slate mt-1">Officers</div>
                </div>
                <div class="bg-navy/5 rounded-xl p-4 text-center border border-line/50">
                  <div class="text-2xl font-bold text-navy font-serif">6</div>
                  <div class="text-xs text-slate mt-1">Programs</div>
                </div>
              </div>
              <div class="space-y-2">
                <div v-for="item in ['Student representation', 'Campus programs', 'Community outreach', 'Leadership development']"
                  :key="item"
                  class="flex items-center gap-2 text-sm text-slate"
                >
                  <svg class="w-4 h-4 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  {{ item }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== FEATURED EVENT (Countdown Banner) ========== -->
    <section
      v-if="showSpotlight && featuredEvent"
      class="relative py-12 md:py-14 overflow-hidden"
    >
      <!-- Background -->
      <div
        class="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style="background-image: url('/admin.webp');"
      />
      <div class="absolute inset-0 bg-navy/85 backdrop-blur-[1px]" />

      <div class="relative px-4 md:px-12">
        <div class="max-w-4xl mx-auto text-center">
          <!-- Badge -->
          <div class="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5 mb-5">
            <span class="relative flex h-2 w-2">
              <span class="animate-pulse absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            <span class="text-xs font-mono uppercase tracking-wider text-orange-300">Featured Event</span>
          </div>

          <!-- Title -->
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-white mb-3 drop-shadow-lg">
            {{ featuredEvent.title }}
          </h2>

          <!-- Date & Location -->
          <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-mono uppercase tracking-wider text-white/50 mb-6">
            <span>{{ formatDate(featuredEvent.date) }}</span>
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              {{ featuredEvent.location }}
            </span>
          </div>

          <!-- Countdown -->
          <div class="mb-6">
            <div v-if="!eventStarted" class="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
              <div class="flex items-center gap-1.5 sm:gap-2">
                <div class="bg-navy/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[3.5rem]">
                  <div class="text-xl sm:text-2xl font-bold font-mono text-gold">{{ String(countdown.days).padStart(2, '0') }}</div>
                  <div class="text-[9px] font-mono uppercase tracking-wider text-white/40">Days</div>
                </div>
                <span class="text-white/30 font-bold text-lg">:</span>
                <div class="bg-navy/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[3.5rem]">
                  <div class="text-xl sm:text-2xl font-bold font-mono text-gold">{{ String(countdown.hours).padStart(2, '0') }}</div>
                  <div class="text-[9px] font-mono uppercase tracking-wider text-white/40">Hrs</div>
                </div>
                <span class="text-white/30 font-bold text-lg">:</span>
                <div class="bg-navy/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[3.5rem]">
                  <div class="text-xl sm:text-2xl font-bold font-mono text-gold">{{ String(countdown.minutes).padStart(2, '0') }}</div>
                  <div class="text-[9px] font-mono uppercase tracking-wider text-white/40">Min</div>
                </div>
                <span class="text-white/30 font-bold text-lg">:</span>
                <div class="bg-navy/80 backdrop-blur-sm border border-white/10 rounded-lg px-3 sm:px-4 py-2 text-center min-w-[3.5rem]">
                  <div class="text-xl sm:text-2xl font-bold font-mono text-gold">{{ String(countdown.seconds).padStart(2, '0') }}</div>
                  <div class="text-[9px] font-mono uppercase tracking-wider text-white/40">Sec</div>
                </div>
              </div>
            </div>
            <div v-else class="text-sm font-mono uppercase tracking-wider text-orange-300">
              Event Started
            </div>
          </div>

          <!-- CTA -->
          <div class="flex flex-wrap justify-center gap-3">
            <button
              @click="router.push('/events')"
              class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gold text-navy font-bold text-sm shadow-xl shadow-black/30 hover:brightness-110 transition-all"
            >
              View Details
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </button>
            <a
              v-if="featuredEvent.trailerUrl"
              :href="featuredEvent.trailerUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/40 bg-white/5 backdrop-blur-sm text-white font-medium text-sm hover:bg-white/15 hover:border-white/60 transition-all"
            >
              Watch Trailer
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== EVENTS CAROUSEL ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <div
          v-motion
          :initial="{ opacity: 0, y: 30 }"
          :enter="{ opacity: 1, y: 0, transition: { duration: 0.5 } }"
          class="text-center mb-12"
        >
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Recent & Upcoming</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Events</h2>
        </div>

        <EventsCarousel :events="events" :loading="eventsLoading" :error="eventsError" />
      </div>
    </section>

    <!-- ========== OFFICERS PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <div
          v-motion
          :initial="{ opacity: 0, y: 30 }"
          :enter="{ opacity: 1, y: 0, transition: { duration: 0.5 } }"
          class="text-center mb-12"
        >
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Leadership</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Executive Officers</h2>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div
            v-for="(officer, index) in executiveOfficers"
            :key="officer.email"
            v-motion
            :initial="{ opacity: 0, y: 30 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 0.4, delay: index * 80 } }"
            :hovered="{ scale: 1.03, y: -2 }"
            class="flex flex-col items-center text-center p-5 rounded-xl border border-line bg-paper-panel shadow-sm cursor-default"
          >
            <div class="w-16 h-16 rounded-full bg-navy border-2 border-gold/40 flex items-center justify-center mb-3">
              <span class="text-gold font-bold text-base font-serif">{{ getInitials(officer.name) }}</span>
            </div>
            <p class="text-xs font-bold text-navy leading-tight">{{ officer.name }}</p>
            <p class="text-[10px] text-gold-dark font-semibold mt-0.5">{{ officer.position }}</p>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/officers"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all officers
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== PROJECTS PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="px-4 md:px-12">
        <div
          v-motion
          :initial="{ opacity: 0, y: 30 }"
          :enter="{ opacity: 1, y: 0, transition: { duration: 0.5 } }"
          class="text-center mb-12"
        >
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">What We Do</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Projects & Programs</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div
            v-for="(project, index) in previewProjects"
            :key="project.title"
            v-motion
            :initial="{ opacity: 0, y: 40 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 0.4, delay: index * 80 } }"
            :hovered="{ scale: 1.03, y: -2 }"
            class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm transition-all cursor-default"
          >
            <div class="text-2xl mb-3">{{ project.icon }}</div>
            <div class="text-[10px] font-mono uppercase tracking-wider text-gold-dark mb-1.5">{{ project.category }}</div>
            <h3 class="text-sm font-bold text-navy mb-2">{{ project.title }}</h3>
            <p class="text-xs text-slate leading-relaxed">{{ project.description }}</p>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/projects"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all projects
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== EVENTS PREVIEW ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <div
          v-motion
          :initial="{ opacity: 0, y: 30 }"
          :enter="{ opacity: 1, y: 0, transition: { duration: 0.5 } }"
          class="text-center mb-12"
        >
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Get Involved</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Upcoming Events</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div
            v-for="(event, index) in previewEvents"
            :key="event.title"
            v-motion
            :initial="{ opacity: 0, y: 40 }"
            :enter="{ opacity: 1, y: 0, transition: { duration: 0.4, delay: index * 80 } }"
            :hovered="{ scale: 1.03, y: -2 }"
            class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm transition-all cursor-default"
          >
            <div class="flex items-center gap-3 mb-3">
              <span class="text-xl">{{ event.icon }}</span>
              <div class="text-[10px] font-mono uppercase tracking-wider text-gold-dark">{{ formatDate(event.date) }}</div>
            </div>
            <h3 class="text-sm font-bold text-navy mb-2">{{ event.title }}</h3>
            <p class="text-xs text-slate leading-relaxed">{{ event.description }}</p>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/events"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all events
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== CTA ========== -->
    <section class="relative py-20 md:py-24 text-white overflow-hidden">
      <!-- Background Image: Admin Side Angle -->
      <div
        class="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105 transition-transform duration-1000 hover:scale-110"
        style="background-image: url('/admin-side-angle.webp');"
      />
      <!-- Gradient Overlay -->
      <div class="absolute inset-0 bg-gradient-to-r from-navy-deep/95 via-navy/90 to-navy-deep/95" />
      <div class="absolute inset-0 bg-navy/50" />

      <div
        v-motion
        :initial="{ opacity: 0, y: 30 }"
        :enter="{ opacity: 1, y: 0, transition: { duration: 0.5 } }"
        class="relative z-10 px-4 md:px-12 text-center max-w-4xl mx-auto"
      >
        <div class="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-full px-4 py-1.5 mb-5 shadow-lg">
          <span class="w-2 h-2 rounded-full bg-gold animate-pulse" />
          <span class="text-xs font-mono uppercase tracking-wider text-gold font-semibold">Officer Portal</span>
        </div>
        <h2 class="text-3xl md:text-4xl font-bold font-serif text-white mb-4 drop-shadow-md">
          USC Officer?
        </h2>
        <p class="text-white/80 mb-8 max-w-xl mx-auto leading-relaxed text-sm md:text-base">
          Access the Officer Portal for attendance management, event tracking, and digital student council services.
        </p>
        <button
          @click="router.push('/portal')"
          class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gold text-navy font-bold text-sm shadow-xl shadow-black/40 hover:brightness-110 active:scale-95 transition-all"
        >
          Visit Officer Portal
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-marquee {
  animation: marquee 25s linear infinite;
}

.animate-marquee:hover {
  animation-play-state: paused;
}

.animate-float {
  animation: float 6s ease-in-out infinite;
  animation-delay: 0.8s;
}
</style>
