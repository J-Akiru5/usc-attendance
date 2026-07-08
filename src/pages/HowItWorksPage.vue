<script setup lang="ts">
const flows = [
  {
    title: 'Event Attendance',
    steps: ['Officer opens system', 'Logs in securely', 'Selects active event', 'GPS verifies location', 'Checks in to event', 'Attendance recorded'],
  },
  {
    title: 'QR Attendance',
    steps: ['Officer opens system', 'Logs in securely', 'Generates personal QR', 'Staff scans QR code', 'Token validated', 'Attendance recorded'],
  },
  {
    title: 'Office Duty',
    steps: ['Officer opens system', 'Logs in securely', 'Views today\'s schedule', 'Checks in at office', 'GPS verifies location', 'Attendance recorded'],
  },
]
</script>

<template>
  <div>
    <!-- Header -->
    <section class="bg-navy text-white py-16 md:py-20">
      <div class="max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold-soft mb-3">Process</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">How attendance works</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Three clear pathways for recording attendance, each designed for a specific use case within the council.
        </p>
      </div>
    </section>

    <!-- Flows -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6 space-y-16">
        <div
          v-for="(flow, fi) in flows"
          :key="flow.title"
        >
          <div class="text-center mb-10">
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-2">Method {{ fi + 1 }}</div>
            <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">{{ flow.title }}</h2>
          </div>

          <!-- Vertical flow -->
          <div class="relative max-w-2xl mx-auto">
            <div class="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-line md:-translate-x-px" />

            <div class="space-y-6">
              <div
                v-for="(step, i) in flow.steps"
                :key="step"
                class="relative flex items-start md:items-center gap-4 md:gap-0"
                :class="i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'"
              >
                <!-- Step number -->
                <div class="absolute left-6 md:left-1/2 w-6 h-6 rounded-full bg-navy border border-gold flex items-center justify-center z-10 md:-translate-x-3 shrink-0">
                  <span class="text-[10px] font-bold text-gold">{{ i + 1 }}</span>
                </div>

                <!-- Spacer -->
                <div class="hidden md:block md:w-1/2" />

                <!-- Content -->
                <div class="pl-14 md:pl-0 md:w-1/2" :class="i % 2 === 0 ? 'md:pl-10 md:text-left' : 'md:pr-10 md:text-right'">
                  <div class="rounded-xl border border-line bg-paper-panel px-5 py-4 shadow-sm">
                    <p class="text-sm font-semibold text-navy">{{ step }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
