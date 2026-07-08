<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const activeFaq = ref<number | null>(null)

function toggleFaq(index: number) {
  activeFaq.value = activeFaq.value === index ? null : index
}

const faqs = [
  {
    question: 'Can students register themselves?',
    answer: 'No. Only official USC officers receive accounts. Registration is managed by system administrators.',
  },
  {
    question: 'Can attendance records be edited?',
    answer: 'No. Attendance is append-only. Once recorded, it cannot be modified or deleted to maintain integrity.',
  },
  {
    question: 'What if the internet is unavailable?',
    answer: 'The system queues attendance locally until the connection returns. All pending records sync automatically when you are back online.',
  },
]

const stats = [
  { label: 'Geolocation Verification', icon: 'map-pin' },
  { label: 'QR Attendance', icon: 'qr' },
  { label: 'Office Duty Tracking', icon: 'building' },
  { label: 'Offline Support', icon: 'wifi-off' },
  { label: 'Audit Trail', icon: 'list' },
  { label: 'Mobile Ready', icon: 'smartphone' },
]

const features = [
  { title: 'Event Attendance', desc: 'Officer check-in through GPS verification.' },
  { title: 'QR Check-in', desc: 'Fast staff-assisted attendance scanning.' },
  { title: 'Office Duty', desc: 'Daily attendance management for office hours.' },
  { title: 'Attendance Export', desc: 'CSV reports for any event or date range.' },
  { title: 'Offline Support', desc: 'Continue working without an internet connection.' },
  { title: 'Audit Trail', desc: 'Transparent, append-only attendance history.' },
]

const steps = [
  'Officer logs in',
  'Select Event',
  'Verify Location',
  'Check In',
  'Attendance Recorded',
  'Staff Export Report',
]

const securityItems = [
  'Secure authentication',
  'GPS verification',
  'Time-limited QR tokens',
  'Audit logging',
  'HTTPS encryption',
]
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative bg-navy text-white overflow-hidden">
      <!-- Blueprint grid texture -->
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="
          background-image:
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
        "
      />
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-navy/80 to-navy" />

      <div class="relative max-w-7xl mx-auto px-4 md:px-6 py-20 md:py-28 lg:py-32 text-center">
        <!-- Logos -->
        <div class="flex items-center justify-center gap-6 mb-8">
          <div class="flex flex-col items-center gap-2">
            <div class="w-14 h-14 rounded-full bg-white/10 border border-gold/60 flex items-center justify-center">
              <span class="text-gold font-bold text-base font-serif">ISUFST</span>
            </div>
            <span class="text-[10px] text-white/40 font-mono uppercase tracking-wider">ISUFST</span>
          </div>
          <div class="h-10 w-px bg-white/20" />
          <div class="flex flex-col items-center gap-2">
            <div class="w-14 h-14 rounded-full bg-white/10 border border-gold/60 flex items-center justify-center">
              <span class="text-gold font-bold text-base font-serif">USC</span>
            </div>
            <span class="text-[10px] text-white/40 font-mono uppercase tracking-wider">USC</span>
          </div>
        </div>

        <!-- Title -->
        <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold font-serif text-white mb-3 tracking-tight">
          University Student Council
        </h1>
        <h2 class="text-xl md:text-2xl lg:text-3xl font-semibold text-gold-soft mb-4">
          Attendance System
        </h2>
        <p class="text-sm md:text-base text-white/50 font-mono uppercase tracking-wider mb-10">
          ISUFST Dingle Campus
        </p>

        <!-- Tagline -->
        <p class="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-8 leading-relaxed">
          Modern attendance management for ISUFST Dingle Campus officers.
        </p>

        <div class="flex flex-wrap items-center justify-center gap-3 mb-12 text-sm text-white/60 font-medium">
          <span class="inline-flex items-center gap-1.5">
            <svg class="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Secure
          </span>
          <span class="hidden sm:inline text-white/20">·</span>
          <span class="inline-flex items-center gap-1.5">
            <svg class="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Location-aware
          </span>
          <span class="hidden sm:inline text-white/20">·</span>
          <span class="inline-flex items-center gap-1.5">
            <svg class="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            QR-enabled
          </span>
          <span class="hidden sm:inline text-white/20">·</span>
          <span class="inline-flex items-center gap-1.5">
            <svg class="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Designed for accountability
          </span>
        </div>

        <button
          @click="router.push('/login')"
          class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gold text-ink font-bold text-base shadow-lg shadow-gold/20 hover:brightness-110 transition-all"
        >
          Sign In
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
        </button>

        <!-- Scroll indicator -->
        <div class="mt-16 flex flex-col items-center gap-2 text-white/30">
          <span class="text-xs font-mono uppercase tracking-widest">Scroll</span>
          <svg class="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
          </svg>
        </div>
      </div>
    </section>

    <!-- Quick Statistics -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div
            v-for="stat in stats"
            :key="stat.label"
            class="rounded-xl border border-line bg-paper-panel p-5 text-center shadow-sm hover:shadow-md transition-shadow"
          >
            <div class="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center mx-auto mb-3">
              <svg v-if="stat.icon === 'map-pin'" class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <svg v-else-if="stat.icon === 'qr'" class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              <svg v-else-if="stat.icon === 'building'" class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
              <svg v-else-if="stat.icon === 'wifi-off'" class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"/>
              </svg>
              <svg v-else-if="stat.icon === 'list'" class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              <svg v-else-if="stat.icon === 'smartphone'" class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
            </div>
            <p class="text-sm font-semibold text-navy">{{ stat.label }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- System Overview -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <!-- Dashboard Mock -->
          <div class="rounded-2xl border border-line bg-paper-panel shadow-lg overflow-hidden">
            <div class="bg-navy-deep px-4 py-3 flex items-center gap-2">
              <div class="flex gap-1.5">
                <div class="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              </div>
              <div class="ml-2 text-[10px] font-mono text-white/40 uppercase tracking-wider">Dashboard Preview</div>
            </div>
            <div class="p-6 space-y-4">
              <div class="flex items-center justify-between">
                <div class="text-sm font-bold text-navy">Today's Events</div>
                <div class="text-xs text-slate font-mono">3 active</div>
              </div>
              <div class="space-y-2">
                <div v-for="i in 3" :key="i" class="flex items-center gap-3 p-3 rounded-lg border border-line/60 bg-paper">
                  <div class="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center">
                    <span class="text-xs font-bold text-navy">E{{ i }}</span>
                  </div>
                  <div class="flex-1">
                    <div class="text-xs font-semibold text-navy">General Assembly {{ i }}</div>
                    <div class="text-[10px] text-slate">Session Hall · 9:00 AM</div>
                  </div>
                  <div class="w-2 h-2 rounded-full" :class="i === 1 ? 'bg-success' : 'bg-line'" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div v-for="label in ['Checked In', 'Pending', 'Total']" :key="label" class="rounded-lg border border-line/60 bg-paper p-3 text-center">
                  <div class="text-lg font-bold text-navy">{{ label === 'Total' ? '48' : label === 'Checked In' ? '32' : '16' }}</div>
                  <div class="text-[10px] text-slate font-mono uppercase">{{ label }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Text -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">System Overview</div>
            <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-6">
              Simplified attendance for modern governance
            </h2>
            <p class="text-slate leading-relaxed mb-6">
              The USC Attendance System simplifies attendance recording through secure geolocation and QR verification. Every check-in is validated, timestamped, and stored with full transparency.
            </p>
            <p class="text-slate leading-relaxed mb-8">
              Designed exclusively for ISUFST Dingle Campus, it replaces manual sign-in sheets with a robust digital audit trail that officers and staff can trust.
            </p>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-navy flex items-center justify-center shrink-0">
                <span class="text-gold font-bold text-sm font-serif">I</span>
              </div>
              <div>
                <div class="text-sm font-semibold text-navy">ISUFST Dingle Campus</div>
                <div class="text-xs text-slate">Official University System</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Core Features -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Core Features</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Built for accountability</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="rounded-xl border border-line bg-paper-panel p-6 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
          >
            <div class="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center mb-4">
              <svg class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <h3 class="text-base font-bold text-navy mb-2">{{ feature.title }}</h3>
            <p class="text-sm text-slate leading-relaxed">{{ feature.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- How it Works -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Process</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">How it works</h2>
        </div>

        <div class="relative">
          <!-- Desktop horizontal line -->
          <div class="hidden lg:block absolute top-[2.25rem] left-[12%] right-[12%] h-px bg-line" />

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 lg:gap-4">
            <div
              v-for="(step, i) in steps"
              :key="step"
              class="relative flex flex-col items-center text-center"
            >
              <div class="w-[4.5rem] h-[4.5rem] rounded-full bg-paper-panel border-2 border-gold flex items-center justify-center z-10 shadow-sm mb-4">
                <span class="text-lg font-bold text-navy">{{ i + 1 }}</span>
              </div>
              <p class="text-sm font-semibold text-navy">{{ step }}</p>
              <p class="text-xs text-slate mt-1 font-mono">Step {{ i + 1 }}</p>

              <!-- Arrow for mobile -->
              <div v-if="i < steps.length - 1" class="lg:hidden mt-3">
                <svg class="w-4 h-4 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Security -->
    <section class="py-16 md:py-20 bg-navy text-white">
      <div class="max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="w-16 h-16 rounded-2xl bg-white/10 border border-gold/40 flex items-center justify-center mx-auto mb-6">
          <svg class="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-white mb-3">Your attendance is protected</h2>
        <p class="text-white/60 mb-10 max-w-xl mx-auto">
          Security and privacy are built into every layer of the system, from authentication to data storage.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
          <div
            v-for="item in securityItems"
            :key="item"
            class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-5 py-4"
          >
            <svg class="w-5 h-5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            <span class="text-sm font-medium text-white/90">{{ item }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-3xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Support</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Frequently Asked Questions</h2>
        </div>

        <div class="space-y-3">
          <div
            v-for="(faq, i) in faqs"
            :key="i"
            class="rounded-xl border border-line bg-paper-panel overflow-hidden shadow-sm"
          >
            <button
              @click="toggleFaq(i)"
              class="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-navy/[0.02] transition-colors"
            >
              <span class="text-sm font-semibold text-navy pr-4">{{ faq.question }}</span>
              <svg
                class="w-4 h-4 text-slate shrink-0 transition-transform"
                :class="activeFaq === i ? 'rotate-180' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <div
              v-show="activeFaq === i"
              class="px-5 pb-4 text-sm text-slate leading-relaxed"
            >
              {{ faq.answer }}
            </div>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/faq"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all questions
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- Contact -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-2xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Contact</div>
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-8">Get in touch</h2>

        <div class="rounded-xl border border-line bg-paper-panel p-8 shadow-sm">
          <div class="space-y-6">
            <div>
              <div class="text-xs font-mono uppercase tracking-wider text-slate mb-1">Organization</div>
              <div class="text-base font-semibold text-navy">University Student Council</div>
              <div class="text-sm text-slate">ISUFST Dingle Campus</div>
            </div>
            <div class="h-px bg-line" />
            <div>
              <div class="text-xs font-mono uppercase tracking-wider text-slate mb-1">Email</div>
              <a href="mailto:usc@isufst.edu.ph" class="text-base font-semibold text-navy hover:text-gold-dark transition-colors">
                usc@isufst.edu.ph
              </a>
            </div>
            <div class="h-px bg-line" />
            <div>
              <div class="text-xs font-mono uppercase tracking-wider text-slate mb-1">Campus</div>
              <div class="text-sm text-slate">ISUFST Dingle Campus<br>Dingle, Iloilo, Philippines</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 md:py-20 bg-navy text-white">
      <div class="max-w-3xl mx-auto px-4 md:px-6 text-center">
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-white mb-4">
          Ready to access the attendance portal?
        </h2>
        <p class="text-white/70 mb-8 max-w-xl mx-auto leading-relaxed">
          Secure attendance management for authorized USC officers. Sign in to manage events, record attendance, and export reports.
        </p>
        <button
          @click="router.push('/login')"
          class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gold text-ink font-bold shadow-lg shadow-gold/20 hover:brightness-110 transition-all"
        >
          Sign In
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
        </button>
      </div>
    </section>
  </div>
</template>
