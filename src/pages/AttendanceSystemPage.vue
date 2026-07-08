<script setup lang="ts">
const methods = [
  {
    title: 'GPS Attendance',
    desc: 'Officers check in via browser geolocation. The server re-validates every coordinate against the event location to prevent remote or fraudulent check-ins.',
    icon: 'map',
    details: ['GPS radius checking', 'Server-side validation', 'Event-specific location'],
  },
  {
    title: 'QR Attendance',
    desc: 'Generate a time-limited, signed QR code for fast staff-assisted check-ins. Each token expires in 60 seconds.',
    icon: 'qr',
    details: ['60-second expiry', 'Cryptographically signed', 'One-time use only'],
  },
  {
    title: 'Office Duty',
    desc: 'Daily office duty attendance with scheduled check-in windows. Officers view today\'s schedule and record presence.',
    icon: 'building',
    details: ['Scheduled windows', 'Daily tracking', 'Automatic recording'],
  },
  {
    title: 'CSV Export',
    desc: 'Export attendance records to CSV for any event, date range, or officer with complete transparency.',
    icon: 'file',
    details: ['Date range filtering', 'Per-event reports', 'Full audit data'],
  },
]
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
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Attendance Management System</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">How Attendance Works</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Three secure pathways for recording attendance, each designed for a specific use case within the council.
        </p>
      </div>
    </section>

    <!-- Methods -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6 space-y-8">
        <div
          v-for="(method, i) in methods"
          :key="method.title"
          class="rounded-2xl border border-line bg-paper-panel shadow-sm overflow-hidden"
        >
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-0">
            <!-- Icon side -->
            <div
              class="lg:col-span-2 flex items-center justify-center p-8 md:p-12"
              :class="i % 2 === 0 ? 'bg-navy/5' : 'bg-[#F0EDE6]'"
            >
              <div class="w-20 h-20 rounded-2xl bg-navy border border-gold/40 flex items-center justify-center">
                <svg v-if="method.icon === 'map'" class="w-9 h-9 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <svg v-else-if="method.icon === 'qr'" class="w-9 h-9 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm0 10h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4-2h2v4h-4v-2h2v-2z"/>
                </svg>
                <svg v-else-if="method.icon === 'building'" class="w-9 h-9 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <svg v-else-if="method.icon === 'file'" class="w-9 h-9 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
            </div>

            <!-- Text side -->
            <div class="lg:col-span-3 p-8 md:p-12 flex flex-col justify-center">
              <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-2">Method {{ i + 1 }}</div>
              <h2 class="text-xl md:text-2xl font-bold font-serif text-navy mb-3">{{ method.title }}</h2>
              <p class="text-slate leading-relaxed mb-5">{{ method.desc }}</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="detail in method.details"
                  :key="detail"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-navy/5 text-navy border border-line/60"
                >
                  <svg class="w-3 h-3 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                  </svg>
                  {{ detail }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-3xl mx-auto px-4 md:px-6 text-center">
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-4">Ready to continue?</h2>
        <p class="text-slate mb-8">Sign in to access the attendance portal and start recording attendance.</p>
        <router-link
          to="/login"
          class="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:brightness-110 transition-all"
        >
          Officer Login
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </router-link>
      </div>
    </section>
  </div>
</template>
