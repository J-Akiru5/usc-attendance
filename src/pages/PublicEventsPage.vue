<script setup lang="ts">
import { publicEvents } from '@/data/events'
</script>

<template>
  <div>
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
      <div class="relative max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Get Involved</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Events</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Upcoming activities and events organized by the University Student Council.
        </p>
      </div>
    </section>

    <!-- Events List -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-4xl mx-auto px-4 md:px-6">
        <div class="space-y-5">
          <div
            v-for="event in publicEvents"
            :key="event.title"
            class="rounded-2xl border border-line bg-paper-panel p-6 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row gap-5"
          >
            <div class="w-14 h-14 rounded-xl bg-navy/5 border border-line flex items-center justify-center shrink-0">
              <span class="text-2xl">{{ event.icon }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-1">{{ event.date }}</div>
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
