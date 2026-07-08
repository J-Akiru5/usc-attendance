<script setup lang="ts">
import { officers } from '@/data/officers'

const executives = officers.filter(o => o.role === 'executive')
const senators = officers.filter(o => o.role === 'senate')

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(p => !p.endsWith('.'))
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
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
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">University Student Council</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Executive Officers</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Meet the officers serving the student body of ISUFST Dingle Campus for the current academic year.
        </p>
      </div>
    </section>

    <!-- Executive Officers -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Executive Board</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Council Leadership</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="officer in executives"
            :key="officer.email"
            class="rounded-2xl border border-line bg-paper-panel p-6 shadow-sm hover:shadow-md transition-all text-center"
          >
            <div class="w-20 h-20 rounded-full bg-navy border-2 border-gold/40 flex items-center justify-center mx-auto mb-4">
              <span class="text-gold font-bold text-lg font-serif">{{ getInitials(officer.name) }}</span>
            </div>
            <h3 class="text-base font-bold text-navy mb-1">{{ officer.name }}</h3>
            <p class="text-sm font-semibold text-gold-dark mb-3">{{ officer.position }}</p>
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy/5 border border-line text-xs text-slate">
              <svg class="w-3.5 h-3.5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              {{ officer.email }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Senators -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Legislative Body</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Student Senate</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div
            v-for="officer in senators"
            :key="officer.email"
            class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm hover:shadow-md transition-all text-center"
          >
            <div class="w-14 h-14 rounded-full bg-navy/10 border border-line flex items-center justify-center mx-auto mb-3">
              <span class="text-navy font-bold text-sm font-serif">{{ getInitials(officer.name) }}</span>
            </div>
            <h3 class="text-sm font-bold text-navy mb-1">{{ officer.name }}</h3>
            <p class="text-xs text-gold-dark font-semibold">{{ officer.position }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
