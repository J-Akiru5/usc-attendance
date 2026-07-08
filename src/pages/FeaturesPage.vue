<script setup lang="ts">
const features = [
  {
    title: 'Geolocation Verification',
    desc: 'Officers check in via browser geolocation. The server re-validates every coordinate against the event location to prevent remote or fraudulent check-ins. GPS radius checking ensures the officer is physically present.',
    icon: 'map',
  },
  {
    title: 'QR Attendance',
    desc: 'Generate a time-limited, signed QR code for fast staff-assisted check-ins. Each token expires in 60 seconds and is tied to the officer identity, preventing reuse or sharing.',
    icon: 'qr',
  },
  {
    title: 'Office Duty Tracking',
    desc: 'Daily office duty attendance with scheduled check-in windows. Officers view today\'s schedule and record presence with the same geolocation safeguards used for events.',
    icon: 'building',
  },
  {
    title: 'Offline Queue',
    desc: 'Continue recording attendance without an internet connection. Check-ins are stored locally in IndexedDB and sync automatically when connectivity returns. Never lose a record.',
    icon: 'wifi',
  },
  {
    title: 'CSV Export',
    desc: 'Export attendance records to CSV for any event, date range, or officer. Reports include timestamps, verification methods, and staff overrides for complete transparency.',
    icon: 'file',
  },
]
</script>

<template>
  <div>
    <!-- Header -->
    <section class="bg-navy text-white py-16 md:py-20">
      <div class="max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold-soft mb-3">Features</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">System capabilities</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Every feature is designed to make attendance recording more secure, transparent, and efficient for the University Student Council.
        </p>
      </div>
    </section>

    <!-- Feature Cards -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6 space-y-6">
        <div
          v-for="(feature, i) in features"
          :key="feature.title"
          class="rounded-2xl border border-line bg-paper-panel shadow-sm overflow-hidden"
        >
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-0">
            <!-- Icon side -->
            <div
              class="lg:col-span-2 flex items-center justify-center p-8 md:p-12"
              :class="i % 2 === 0 ? 'bg-navy/5' : 'bg-[#F0EDE6]'"
            >
              <div class="w-20 h-20 rounded-2xl bg-navy border border-gold/40 flex items-center justify-center">
                <svg
                  v-if="feature.icon === 'map'"
                  class="w-9 h-9 text-gold"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <svg
                  v-else-if="feature.icon === 'qr'"
                  class="w-9 h-9 text-gold"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
                </svg>
                <svg
                  v-else-if="feature.icon === 'building'"
                  class="w-9 h-9 text-gold"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <svg
                  v-else-if="feature.icon === 'wifi'"
                  class="w-9 h-9 text-gold"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" />
                </svg>
                <svg
                  v-else-if="feature.icon === 'file'"
                  class="w-9 h-9 text-gold"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>

            <!-- Text side -->
            <div class="lg:col-span-3 p-8 md:p-12 flex flex-col justify-center">
              <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-2">Feature {{ i + 1 }}</div>
              <h2 class="text-xl md:text-2xl font-bold font-serif text-navy mb-4">{{ feature.title }}</h2>
              <p class="text-slate leading-relaxed">{{ feature.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
