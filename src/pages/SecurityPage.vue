<script setup lang="ts">
const securityCards = [
  {
    title: 'Secure Authentication',
    desc: 'Only authenticated USC officers can access attendance features. Secure login protects against unauthorized access.',
    icon: 'lock',
  },
  {
    title: 'QR Token Security',
    desc: 'QR codes are time-limited (60s) and cryptographically signed. Expired or reused tokens are automatically rejected.',
    icon: 'qr',
  },
  {
    title: 'Location Validation',
    desc: 'Geolocation verification ensures officers must be within the required radius to check in successfully.',
    icon: 'map',
  },
  {
    title: 'Data Integrity',
    desc: 'Attendance records are append-only and are never edited in the database. All corrections are added as new rows.',
    icon: 'shield',
  },
  {
    title: 'Privacy First',
    desc: 'We do not collect personal data about where an officer is necessary for the check-in only.',
    icon: 'eye',
  },
  {
    title: 'Encrypted Connection',
    desc: 'All data is transmitted securely using HTTPS encryption.',
    icon: 'wifi',
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
        <div class="w-16 h-16 rounded-2xl bg-white/10 border border-gold/40 flex items-center justify-center mx-auto mb-5">
          <svg class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Security &amp; Privacy</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">
          Your data and attendance are protected<br>with industry-standard practices.
        </h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Security is not a feature — it is the foundation. Every design decision prioritizes the integrity of attendance data and the privacy of officers.
        </p>
      </div>
    </section>

    <!-- ========== SECURITY CARDS ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-6xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="card in securityCards"
            :key="card.title"
            class="rounded-xl border border-line bg-paper-panel p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <!-- Icon -->
            <div class="w-12 h-12 rounded-xl bg-navy/5 border border-line flex items-center justify-center mb-4">
              <svg v-if="card.icon === 'lock'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <svg v-else-if="card.icon === 'qr'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm0 10h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4-2h2v4h-4v-2h2v-2z"/>
              </svg>
              <svg v-else-if="card.icon === 'map'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <svg v-else-if="card.icon === 'shield'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              <svg v-else-if="card.icon === 'eye'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
              <svg v-else-if="card.icon === 'wifi'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-navy mb-2">{{ card.title }}</h3>
            <p class="text-sm text-slate leading-relaxed">{{ card.desc }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
