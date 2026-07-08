<script setup lang="ts">
const timeline = [
  { title: 'Manual Attendance', desc: 'Paper-based sign-in sheets and manual tallying.' },
  { title: 'Geolocation', desc: 'Introduction of GPS-verified digital check-ins.' },
  { title: 'QR Attendance', desc: 'Fast, staff-assisted QR code scanning.' },
  { title: 'Office Duty', desc: 'Expanded to daily office duty tracking and reporting.' },
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
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">About the Portal</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">USC Digital Portal</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          The official digital platform of the University Student Council of ISUFST Dingle Campus.
        </p>
      </div>
    </section>

    <!-- Mission -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-3xl mx-auto px-4 md:px-6">
        <div class="rounded-2xl border border-line bg-paper-panel p-8 md:p-12 shadow-sm text-center">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-4">Purpose</div>
          <p class="text-xl md:text-2xl font-serif text-navy leading-relaxed">
            Provide <span class="text-gold-dark font-semibold">secure</span>,
            <span class="text-gold-dark font-semibold">reliable</span>, and
            <span class="text-gold-dark font-semibold">modern</span>
            digital services for USC officers.
          </p>
        </div>
      </div>
    </section>

    <!-- About Content -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <!-- Text -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Current Service</div>
            <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-6">Attendance Management System</h2>
            <p class="text-slate leading-relaxed mb-4">
              The USC Digital Portal currently offers one official digital service: the Attendance Management System. It handles event check-ins, QR-based attendance, office duty tracking, and attendance reporting for all authorized USC officers.
            </p>
            <p class="text-slate leading-relaxed mb-8">
              Future digital services may be added as the council's operational needs continue to evolve. The portal is designed to grow with the University Student Council.
            </p>

            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-navy flex items-center justify-center shrink-0">
                <span class="text-gold font-bold text-sm font-serif">I</span>
              </div>
              <div>
                <div class="text-sm font-semibold text-navy">ISUFST Dingle Campus</div>
                <div class="text-xs text-slate">Official University Platform</div>
              </div>
            </div>
          </div>

          <!-- Feature card -->
          <div class="rounded-2xl border border-line bg-paper-panel shadow-lg p-8">
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-4">Attendance System</div>
            <h3 class="text-lg font-bold font-serif text-navy mb-4">Capabilities</h3>
            <div class="space-y-3">
              <div v-for="item in ['GPS-verified event check-ins', 'QR code attendance scanning', 'Office duty management', 'CSV attendance reports', 'Offline-ready PWA', 'Append-only audit trail']" :key="item" class="flex items-center gap-3">
                <svg class="w-4 h-4 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                <span class="text-sm text-slate">{{ item }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Timeline -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-4xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Evolution</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">System evolution</h2>
        </div>

        <div class="relative">
          <div class="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-line md:-translate-x-px" />

          <div class="space-y-10">
            <div
              v-for="(item, i) in timeline"
              :key="item.title"
              class="relative flex items-start md:items-center gap-6 md:gap-0"
              :class="i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'"
            >
              <div class="absolute left-4 md:left-1/2 w-3 h-3 rounded-full bg-gold border-2 border-paper-panel z-10 md:-translate-x-1.5 mt-1.5 md:mt-0" />
              <div class="hidden md:block md:w-1/2" />
              <div class="pl-10 md:pl-0 md:w-1/2" :class="i % 2 === 0 ? 'md:pl-12 md:text-left' : 'md:pr-12 md:text-right'">
                <div class="rounded-xl border border-line bg-paper-panel p-5 shadow-sm inline-block">
                  <h3 class="text-sm font-bold text-navy mb-1">{{ item.title }}</h3>
                  <p class="text-sm text-slate">{{ item.desc }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
