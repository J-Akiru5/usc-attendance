<script setup lang="ts">
const benefits = [
  'Accurate attendance recording',
  'Real-time verification',
  'Reduced manual workload',
  'Improved accountability',
  'Secure and audit ready',
  'Accessible anytime, anywhere',
]

const timeline = [
  {
    title: 'Manual Attendance',
    desc: 'Traditional paper sign-in sheets with manual tallying.',
    icon: 'paper',
  },
  {
    title: 'Geolocation',
    desc: 'Added modern GPS-based location verification.',
    icon: 'map',
  },
  {
    title: 'QR Attendance',
    desc: 'Introduced QR for faster check-in.',
    icon: 'qr',
  },
  {
    title: 'Office Duty',
    desc: 'Daily tracking and reporting with early check-in.',
    icon: 'building',
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
      <div class="relative max-w-7xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">About the System</div>
            <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold font-serif mb-4 leading-tight">
              About the System
            </h1>
            <p class="text-white/70 max-w-lg leading-relaxed">
              Learn more about the USC Attendance System and its purpose for the USC officers.
            </p>
          </div>
          <!-- Illustration block -->
          <div class="hidden lg:flex justify-end">
            <div class="w-72 h-48 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden">
              <div class="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent" />
              <div class="text-center relative z-10">
                <div class="w-16 h-16 rounded-2xl bg-gold/20 border border-gold/40 flex items-center justify-center mx-auto mb-3">
                  <svg class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                </div>
                <div class="text-sm font-semibold text-white">ISUFST Dingle Campus</div>
                <div class="text-xs text-white/50 font-mono mt-1">University Student Council</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== MISSION & PURPOSE ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Mission -->
          <div class="rounded-2xl border border-line bg-paper-panel p-8 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-navy/5 border border-line flex items-center justify-center mb-5">
              <svg class="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
              </svg>
            </div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Our Mission</div>
            <h2 class="text-xl font-bold font-serif text-navy mb-3">Transparency through technology</h2>
            <p class="text-slate leading-relaxed text-sm">
              To provide transparency, accountability, and efficiency in attendance management through the responsible use of technology.
            </p>
          </div>

          <!-- Purpose -->
          <div class="rounded-2xl border border-line bg-paper-panel p-8 shadow-sm">
            <div class="w-12 h-12 rounded-xl bg-navy/5 border border-line flex items-center justify-center mb-5">
              <svg class="w-6 h-6 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Our Purpose</div>
            <h2 class="text-xl font-bold font-serif text-navy mb-3">Built for accountability</h2>
            <p class="text-slate leading-relaxed text-sm">
              The USC Attendance System was developed to provide an accurate, tamper-resistant, and convenient way of recording attendance for events and office duties.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== BENEFITS ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <!-- Left: Illustration/chart -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Benefits</div>
            <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-6">
              Built for every stakeholder
            </h2>
            <p class="text-slate leading-relaxed mb-8">
              From officers to administrators, the USC Attendance System improves transparency, reduces errors, and makes governance more efficient at every level.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="benefit in benefits"
                :key="benefit"
                class="flex items-center gap-2.5 text-sm text-slate"
              >
                <svg class="w-4 h-4 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
                {{ benefit }}
              </div>
            </div>
          </div>

          <!-- Right: Stakeholder cards -->
          <div class="space-y-4">
            <div class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm">
              <div class="text-sm font-bold text-navy mb-1">For Officers</div>
              <p class="text-sm text-slate">Quick, fair check-ins with clear audit trails. No more lost sign-in sheets or disputes.</p>
            </div>
            <div class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm">
              <div class="text-sm font-bold text-navy mb-1">For Staff</div>
              <p class="text-sm text-slate">Real-time attendance dashboards, manual override controls, and instant CSV exports.</p>
            </div>
            <div class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm">
              <div class="text-sm font-bold text-navy mb-1">For the Council</div>
              <p class="text-sm text-slate">Institutional-grade accountability and transparent governance backed by immutable records.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== OUR JOURNEY (TIMELINE) ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">History</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Our Journey</h2>
        </div>

        <!-- Horizontal timeline -->
        <div class="relative">
          <!-- Line -->
          <div class="hidden md:block absolute top-8 left-0 right-0 h-px bg-line z-0" />

          <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div
              v-for="item in timeline"
              :key="item.title"
              class="relative flex flex-col items-center text-center"
            >
              <!-- Dot -->
              <div class="w-16 h-16 rounded-full bg-paper-panel border-2 border-gold flex items-center justify-center z-10 shadow-sm mb-4">
                <!-- Paper icon -->
                <svg v-if="item.icon === 'paper'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <svg v-else-if="item.icon === 'map'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <svg v-else-if="item.icon === 'qr'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm0 10h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4-2h2v4h-4v-2h2v-2z"/>
                </svg>
                <svg v-else-if="item.icon === 'building'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
              </div>
              <div class="text-sm font-bold text-navy mb-1">{{ item.title }}</div>
              <p class="text-xs text-slate leading-snug">{{ item.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
