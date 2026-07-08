<script setup lang="ts">
const timeline = [
  { title: 'Manual Attendance', desc: 'Paper-based sign-in sheets and manual tallying.' },
  { title: 'Geolocation', desc: 'Introduction of GPS-verified digital check-ins.' },
  { title: 'QR Attendance', desc: 'Fast, staff-assisted QR code scanning.' },
  { title: 'Office Duty', desc: 'Expanded to daily office duty tracking and reporting.' },
]

const objectives = [
  'Improve transparency in attendance recording',
  'Increase efficiency for event management',
  'Strengthen accountability among officers',
  'Reduce errors and disputes in attendance data',
  'Provide audit-ready historical records',
]

const benefits = [
  { title: 'For Officers', desc: 'Quick, fair check-ins with clear audit trails. No more lost sign-in sheets.' },
  { title: 'For Staff', desc: 'Real-time attendance dashboards and instant CSV exports.' },
  { title: 'For the Council', desc: 'Institutional-grade accountability and transparent governance.' },
]
</script>

<template>
  <div>
    <!-- Header -->
    <section class="bg-navy text-white py-16 md:py-20">
      <div class="max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold-soft mb-3">About the System</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Purpose, History & Objectives</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          The USC Attendance System was built to modernize how the University Student Council tracks officer presence — replacing manual processes with secure, verifiable digital records.
        </p>
      </div>
    </section>

    <!-- Mission -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-3xl mx-auto px-4 md:px-6 text-center">
        <div class="rounded-2xl border border-line bg-paper-panel p-8 md:p-12 shadow-sm">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-4">Mission</div>
          <p class="text-xl md:text-2xl font-serif text-navy leading-relaxed">
            Improve <span class="text-gold-dark font-semibold">transparency</span>,
            <span class="text-gold-dark font-semibold">efficiency</span>, and
            <span class="text-gold-dark font-semibold">accountability</span>
            of USC attendance.
          </p>
        </div>
      </div>
    </section>

    <!-- Objectives -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Objectives</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">What we set out to achieve</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="(obj, i) in objectives"
            :key="i"
            class="rounded-xl border border-line bg-paper-panel p-6 shadow-sm flex items-start gap-4"
          >
            <div class="w-8 h-8 rounded-full bg-navy/5 flex items-center justify-center shrink-0 mt-0.5">
              <span class="text-sm font-bold text-navy">{{ i + 1 }}</span>
            </div>
            <p class="text-sm text-navy font-medium leading-relaxed">{{ obj }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Benefits -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Benefits</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Built for every stakeholder</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div
            v-for="b in benefits"
            :key="b.title"
            class="rounded-xl border border-line bg-paper-panel p-6 shadow-sm"
          >
            <h3 class="text-base font-bold text-navy mb-2">{{ b.title }}</h3>
            <p class="text-sm text-slate leading-relaxed">{{ b.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Timeline -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-4xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Evolution</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">System evolution</h2>
        </div>

        <div class="relative">
          <!-- Vertical line -->
          <div class="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-line md:-translate-x-px" />

          <div class="space-y-10">
            <div
              v-for="(item, i) in timeline"
              :key="item.title"
              class="relative flex items-start md:items-center gap-6 md:gap-0"
              :class="i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'"
            >
              <!-- Dot -->
              <div class="absolute left-4 md:left-1/2 w-3 h-3 rounded-full bg-gold border-2 border-paper-panel z-10 md:-translate-x-1.5 mt-1.5 md:mt-0" />

              <!-- Spacer for alignment -->
              <div class="hidden md:block md:w-1/2" :class="i % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12 md:text-left'" />

              <!-- Content -->
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
