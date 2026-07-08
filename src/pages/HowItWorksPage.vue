<script setup lang="ts">
const flows = [
  {
    id: 'self',
    title: 'Event Attendance (Self Check-In)',
    subtitle: 'Officers check in on their own via GPS verification.',
    steps: [
      { label: 'Officer\nlogin', icon: 'user' },
      { label: 'Select\nEvent', icon: 'calendar' },
      { label: 'Verify\nLocation', icon: 'map' },
      { label: 'Check In', icon: 'check' },
      { label: 'Attendance\nRecorded', icon: 'record' },
    ],
  },
  {
    id: 'qr',
    title: 'QR Attendance (Staff Assisted)',
    subtitle: 'Staff scan a QR code to record officer attendance.',
    steps: [
      { label: 'Officer generates\nQR Code', icon: 'qr' },
      { label: 'Staff scans\nQR Code', icon: 'scan' },
      { label: 'System\nvalidates', icon: 'shield' },
      { label: 'Attendance\nRecorded', icon: 'record' },
    ],
  },
  {
    id: 'duty',
    title: 'Office Duty Check-In',
    subtitle: 'Officers record their daily office duty attendance.',
    steps: [
      { label: "View today's\nschedule", icon: 'list' },
      { label: 'Check in for\noffice duty', icon: 'building' },
      { label: 'Attendance\nRecorded', icon: 'record' },
    ],
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
      <div class="relative max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Process</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">How Attendance Works</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Simple steps. Secure process. Three clear pathways for recording attendance, each designed for a specific use case.
        </p>
      </div>
    </section>

    <!-- ========== FLOW DIAGRAMS ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6 space-y-16">

        <div v-for="flow in flows" :key="flow.id">
          <!-- Section header -->
          <div class="mb-8">
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-2">Process</div>
            <h2 class="text-xl md:text-2xl font-bold font-serif text-navy mb-1">{{ flow.title }}</h2>
            <p class="text-slate text-sm">{{ flow.subtitle }}</p>
          </div>

          <!-- Flow steps -->
          <div class="relative">
            <!-- Connecting line (desktop) -->
            <div class="hidden md:block absolute top-8 left-8 right-8 h-0.5 bg-line z-0" />

            <div class="grid gap-4" :style="`grid-template-columns: repeat(${flow.steps.length}, 1fr)`">
              <div
                v-for="(step, si) in flow.steps"
                :key="si"
                class="relative flex flex-col items-center text-center z-10"
              >
                <!-- Step circle -->
                <div class="w-16 h-16 rounded-full bg-paper-panel border-2 border-gold flex items-center justify-center shadow-sm mb-3">
                  <!-- User icon -->
                  <svg v-if="step.icon === 'user'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  <!-- Calendar icon -->
                  <svg v-else-if="step.icon === 'calendar'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <!-- Map icon -->
                  <svg v-else-if="step.icon === 'map'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  <!-- Check icon -->
                  <svg v-else-if="step.icon === 'check'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  <!-- Record icon -->
                  <svg v-else-if="step.icon === 'record'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                  </svg>
                  <!-- QR icon -->
                  <svg v-else-if="step.icon === 'qr'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm0 10h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4-2h2v4h-4v-2h2v-2z"/>
                  </svg>
                  <!-- Scan icon -->
                  <svg v-else-if="step.icon === 'scan'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9V6a2 2 0 012-2h2M3 15v3a2 2 0 002 2h2m10-16h2a2 2 0 012 2v2m0 10v3a2 2 0 01-2 2h-2M8 12h8"/>
                  </svg>
                  <!-- Shield icon -->
                  <svg v-else-if="step.icon === 'shield'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                  <!-- List icon -->
                  <svg v-else-if="step.icon === 'list'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                  </svg>
                  <!-- Building icon -->
                  <svg v-else-if="step.icon === 'building'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                </div>

                <!-- Arrow between steps -->
                <div
                  v-if="si < flow.steps.length - 1"
                  class="absolute top-7 -right-3 w-6 h-6 hidden md:flex items-center justify-center z-20"
                >
                  <svg class="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>

                <!-- Step label -->
                <p class="text-xs font-semibold text-navy leading-tight whitespace-pre-line">{{ step.label }}</p>
              </div>
            </div>
          </div>

          <!-- Divider between flows -->
          <div class="mt-12 border-t border-line" v-if="flow.id !== 'duty'" />
        </div>

        <!-- Info note -->
        <div class="rounded-xl border border-gold/40 bg-gold/5 p-5 flex items-start gap-4">
          <div class="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
          </div>
          <div>
            <div class="text-sm font-bold text-navy mb-1">All records are secure and immutable</div>
            <p class="text-sm text-slate">All records are secure, time-stamped, and cannot be edited once entered. Staff officers are logged with identity and timestamp for complete transparency.</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
