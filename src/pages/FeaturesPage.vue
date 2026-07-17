<script setup lang="ts">
const features = [
  {
    title: 'Geolocation Verification',
    desc: 'Officers check in via the registered GPS radius before checking in. Every coordinate is validated server-side to prevent remote check-ins.',
    icon: 'map',
  },
  {
    title: 'QR Attendance',
    desc: 'Officers scan a time-limited QR code to instantly record attendance. Tokens expire in 60 seconds and cannot be reused.',
    icon: 'qr',
  },
  {
    title: 'Office Duty Tracking',
    desc: 'Daily office duty attendance with scheduled check-in windows. Officers view today\'s schedule and record presence with the same geolocation safeguards.',
    icon: 'building',
  },
  {
    title: 'Offline Support',
    desc: 'Records are stored locally and synced automatically when reconnected. Never lose a check-in due to network issues.',
    icon: 'wifi',
  },
  {
    title: 'CSV Export',
    desc: 'Export attendance reports per event in CSV format for documentation and reporting purposes.',
    icon: 'csv',
  },
  {
    title: 'Audit Trail',
    desc: 'Every attendance record is timestamped and cannot be edited or deleted. Every correction is a new row.',
    icon: 'audit',
  },
]
</script>

<template>
  <div>
    <!-- ========== HEADER ========== -->
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
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Features</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">
          Powerful features built for<br>modern attendance management.
        </h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Every feature is designed to make attendance recording more secure, transparent, and efficient for the University Student Council.
        </p>
      </div>
    </section>

    <!-- ========== FEATURE GRID ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="rounded-2xl border border-line bg-paper-panel p-8 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group"
          >
            <div class="w-16 h-16 rounded-2xl bg-navy flex items-center justify-center mb-6 group-hover:bg-navy-deep transition-colors">
              <svg v-if="feature.icon === 'map'" class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <svg v-else-if="feature.icon === 'qr'" class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm0 10h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4-2h2v4h-4v-2h2v-2z"/>
              </svg>
              <svg v-else-if="feature.icon === 'building'" class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
              <svg v-else-if="feature.icon === 'wifi'" class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
              </svg>
              <svg v-else-if="feature.icon === 'csv'" class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <svg v-else-if="feature.icon === 'audit'" class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <h2 class="text-lg font-bold font-serif text-navy mb-3">{{ feature.title }}</h2>
            <p class="text-slate leading-relaxed text-sm">{{ feature.desc }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
