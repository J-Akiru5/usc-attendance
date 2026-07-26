<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VideoPlayer from '@/components/ui/VideoPlayer.vue'
import eventsJson from '../../public/data/events.json'

interface PublicEvent {
  id: string
  title: string
  date: string
  endDate?: string | null
  description: string
  location: string
  venue?: string | null
  status: string
  featured: boolean
  coverImage?: string | null
  gallery?: string[] | null
  trailerUrl?: string | null
  tags?: string[] | null
  icon?: string | null
}

const events = ref<PublicEvent[]>([])
const loading = ref(true)

const featuredEvent = computed(() => events.value.find(e => e.featured) ?? null)

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  })
}

onMounted(async () => {
  try {
    const res = await fetch('/api/cms/events')
    if (res.ok) {
      const data: PublicEvent[] = await res.json()
      events.value = data.length > 0 ? data : (eventsJson as PublicEvent[])
    } else {
      events.value = eventsJson as PublicEvent[]
    }
  } catch {
    events.value = eventsJson as PublicEvent[]
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <!-- Featured Event Video -->
    <section
      v-if="featuredEvent?.trailerUrl"
      class="relative py-16 md:py-20 overflow-hidden"
    >
      <div class="absolute inset-0 bg-navy" />
      <div
        class="absolute inset-0 opacity-[0.03]"
        style="
          background-image:
            linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px);
          background-size: 50px 50px;
        "
      />
      <div class="relative px-4 md:px-12">
        <div class="text-center mb-8">
          <div class="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5 mb-4">
            <span class="relative flex h-2 w-2">
              <span class="animate-pulse absolute inline-flex h-full w-full rounded-full bg-gold opacity-75" />
              <span class="relative inline-flex rounded-full h-2 w-2 bg-gold" />
            </span>
            <span class="text-xs font-mono uppercase tracking-wider text-gold">Featured Event</span>
          </div>
          <h2 class="text-3xl md:text-4xl font-bold font-serif text-white mb-2 drop-shadow-lg">
            {{ featuredEvent.title }}
          </h2>
          <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-mono uppercase tracking-wider text-white/50">
            <span>{{ formatDate(featuredEvent.date) }}</span>
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {{ featuredEvent.venue ? `${featuredEvent.venue}, ${featuredEvent.location}` : featuredEvent.location }}
            </span>
          </div>
        </div>
        <div class="max-w-3xl mx-auto">
          <VideoPlayer
            :src="featuredEvent.trailerUrl ?? undefined"
            :poster="featuredEvent.coverImage ?? undefined"
            :title="featuredEvent.title"
          />
        </div>
      </div>
    </section>

    <!-- Header -->
    <section class="bg-navy text-white py-16 md:py-20 relative overflow-hidden">
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
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Get Involved</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Events</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Upcoming activities and events organized by the University Student Council.
        </p>
      </div>
    </section>

    <!-- Events List -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <!-- Pag-Abi-Abi Photo Booth Banner -->
        <router-link
          to="/events/pag-abi-abi/photobooth"
          class="block mb-8 rounded-2xl border border-gold/30 bg-gradient-to-r from-[#0B132B] to-[#162040] p-5 sm:p-6 hover:from-[#0f1a38] hover:to-[#1a2850] transition-all group"
        >
          <div class="flex flex-col sm:flex-row items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-gold/15 border border-gold/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <svg class="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div class="text-center sm:text-left">
              <h3 class="text-white font-bold text-sm sm:text-base mb-1 group-hover:text-gold transition-colors">Pag-Abi-Abi Photo Booth Gallery</h3>
              <p class="text-white/50 text-xs sm:text-sm">View and download your photo booth pictures from the event.</p>
            </div>
            <div class="sm:ml-auto shrink-0">
              <span class="inline-flex items-center gap-1.5 bg-gold/15 border border-gold/30 rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-gold group-hover:bg-gold/25 transition-colors">
                Open Gallery
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </div>
        </router-link>

        <div v-if="loading" class="text-center py-12">
          <div class="inline-flex items-center gap-2 text-gold">
            <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span class="text-sm font-mono uppercase tracking-wider">Loading events...</span>
          </div>
        </div>
        <div v-else-if="events.length === 0" class="text-center py-12">
          <p class="text-slate">No events found.</p>
        </div>
        <div v-else class="space-y-5">
          <div
            v-for="event in events"
            :key="event.id"
            class="rounded-2xl border border-line bg-paper-panel p-6 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row gap-5"
          >
            <div class="w-14 h-14 rounded-xl bg-navy/5 border border-line flex items-center justify-center shrink-0">
              <span class="text-2xl">{{ event.icon }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-1">{{ formatDate(event.date) }}</div>
              <h3 class="text-lg font-bold text-navy mb-2">{{ event.title }}</h3>
              <p class="text-sm text-slate leading-relaxed mb-3">{{ event.description }}</p>
              <div class="flex items-center gap-1.5 text-xs text-slate">
                <svg class="w-3.5 h-3.5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                {{ event.location }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
