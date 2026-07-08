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
    question: 'Can anyone register for an account?',
    answer: 'No. Only official USC officers receive accounts. Registration is managed by system administrators.',
  },
  {
    question: 'Can attendance records be edited or deleted?',
    answer: 'No. Attendance is append-only. Once recorded, it cannot be modified or deleted to maintain integrity.',
  },
  {
    question: 'What if the internet is unavailable?',
    answer: 'The system queues attendance locally until the connection returns. All pending records sync automatically when you are back online.',
  },
  {
    question: 'Is geolocation always required?',
    answer: 'For event check-ins, yes. Staff can perform manual overrides when geolocation is unavailable, and these overrides are fully logged.',
  },
  {
    question: 'Can I use the system on my mobile phone?',
    answer: 'Yes. The system is a Progressive Web App (PWA) and can be installed on your home screen and used offline.',
  },
  {
    question: 'How do I reset my password?',
    answer: 'Contact a system administrator or the USC technical team. Password resets are handled securely by admins.',
  },
]

const heroBadges = [
  {
    icon: 'map',
    label: 'Geolocation\nVerification',
  },
  {
    icon: 'qr',
    label: 'QR\nAttendance',
  },
  {
    icon: 'building',
    label: 'Office Duty\nTracking',
  },
  {
    icon: 'wifi',
    label: 'Offline\nSupport',
  },
  {
    icon: 'audit',
    label: 'Audit\nTrail',
  },
  {
    icon: 'csv',
    label: 'CSV\nReports',
  },
]

const coreFeatures = [
  {
    title: 'Event Attendance',
    desc: 'Officers check in through GPS verification tied to the event location.',
    icon: 'calendar',
  },
  {
    title: 'QR Check-In',
    desc: 'Fast staff-assisted QR code scanning for delegated attendance.',
    icon: 'qr',
  },
  {
    title: 'Office Duty',
    desc: 'Daily tracking and reporting for assigned officer office hours.',
    icon: 'building',
  },
  {
    title: 'Offline Support',
    desc: 'Attendance is queued locally and synced automatically when reconnected.',
    icon: 'wifi',
  },
  {
    title: 'Attendance Export',
    desc: 'Download CSV reports for any event, date range, or officer.',
    icon: 'csv',
  },
  {
    title: 'Audit Trail',
    desc: 'Every check-in is time-stamped and immutable for transparent records.',
    icon: 'audit',
  },
]
</script>

<template>
  <div>
    <!-- ========== HERO ========== -->
    <section class="relative bg-navy text-white overflow-hidden min-h-[520px] flex items-center">
      <!-- Blueprint grid texture -->
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="
          background-image:
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
          background-size: 40px 40px;
        "
      />
      <div class="absolute inset-0 bg-gradient-to-r from-navy via-navy/90 to-navy/60" />

      <div class="relative max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20 w-full">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <!-- Left: Text content -->
          <div>
            <!-- Label -->
            <div class="text-xs font-mono uppercase tracking-widest text-gold mb-4">
              University Student Council
            </div>

            <!-- Main title -->
            <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold font-serif leading-tight mb-3">
              Attendance<br>System
            </h1>

            <!-- Tagline -->
            <p class="text-white/70 text-base md:text-lg leading-relaxed mb-8 max-w-md">
              A secure and modern attendance management system for the USC officers of ISUFST Dingle Campus.
            </p>

            <!-- CTA buttons -->
            <div class="flex flex-wrap gap-3 mb-10">
              <button
                @click="router.push('/login')"
                class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gold text-navy font-bold text-sm shadow-lg shadow-gold/20 hover:brightness-110 transition-all"
              >
                Login to Portal
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                </svg>
              </button>
              <button
                @click="router.push('/about')"
                class="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/30 text-white font-medium text-sm hover:bg-white/10 transition-all"
              >
                Learn More
              </button>
            </div>

            <!-- Feature icon badges -->
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
              <div
                v-for="badge in heroBadges"
                :key="badge.label"
                class="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-default"
              >
                <!-- Map icon -->
                <svg v-if="badge.icon === 'map'" class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <!-- QR icon -->
                <svg v-else-if="badge.icon === 'qr'" class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm0 10h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4-2h2v4h-4v-2h2v-2z"/>
                </svg>
                <!-- Building icon -->
                <svg v-else-if="badge.icon === 'building'" class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                <!-- Wifi icon -->
                <svg v-else-if="badge.icon === 'wifi'" class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
                </svg>
                <!-- Audit icon -->
                <svg v-else-if="badge.icon === 'audit'" class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <!-- CSV icon -->
                <svg v-else-if="badge.icon === 'csv'" class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span class="text-[9px] font-medium text-white/60 text-center leading-tight whitespace-pre-line">{{ badge.label }}</span>
              </div>
            </div>
          </div>

          <!-- Right: Campus illustration / dashboard preview -->
          <div class="hidden lg:block">
            <div class="relative">
              <!-- Decorative glow -->
              <div class="absolute -inset-4 bg-gold/5 rounded-3xl blur-2xl" />
              <!-- Dashboard preview card -->
              <div class="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
                <!-- Browser chrome -->
                <div class="bg-navy-deep/80 px-4 py-3 flex items-center gap-2 border-b border-white/10">
                  <div class="flex gap-1.5">
                    <div class="w-3 h-3 rounded-full bg-red-400/60" />
                    <div class="w-3 h-3 rounded-full bg-yellow-400/60" />
                    <div class="w-3 h-3 rounded-full bg-green-400/60" />
                  </div>
                  <div class="flex-1 mx-3">
                    <div class="bg-white/10 rounded px-3 py-1 text-[10px] font-mono text-white/40">
                      attendance.isufst.edu.ph
                    </div>
                  </div>
                </div>
                <!-- Dashboard content -->
                <div class="p-6 space-y-4 bg-paper/5">
                  <!-- Header row -->
                  <div class="flex items-center justify-between">
                    <div class="text-sm font-bold text-white">Today's Events</div>
                    <span class="text-[10px] font-mono bg-gold/20 text-gold px-2 py-0.5 rounded-full">3 active</span>
                  </div>
                  <!-- Event items -->
                  <div class="space-y-2">
                    <div v-for="i in 3" :key="i" class="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5">
                      <div class="w-8 h-8 rounded-full bg-navy border border-gold/30 flex items-center justify-center">
                        <span class="text-xs font-bold text-gold">E{{ i }}</span>
                      </div>
                      <div class="flex-1">
                        <div class="text-xs font-semibold text-white">General Assembly {{ i }}</div>
                        <div class="text-[10px] text-white/40">Session Hall · 9:00 AM</div>
                      </div>
                      <div class="w-2 h-2 rounded-full" :class="i === 1 ? 'bg-green-400' : 'bg-white/20'" />
                    </div>
                  </div>
                  <!-- Stats row -->
                  <div class="grid grid-cols-3 gap-2">
                    <div class="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
                      <div class="text-xl font-bold text-gold">32</div>
                      <div class="text-[9px] text-white/40 font-mono uppercase">Checked In</div>
                    </div>
                    <div class="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
                      <div class="text-xl font-bold text-white">16</div>
                      <div class="text-[9px] text-white/40 font-mono uppercase">Pending</div>
                    </div>
                    <div class="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
                      <div class="text-xl font-bold text-white">48</div>
                      <div class="text-[9px] text-white/40 font-mono uppercase">Total</div>
                    </div>
                  </div>
                  <!-- Progress bar -->
                  <div>
                    <div class="flex justify-between text-[10px] text-white/40 mb-1.5">
                      <span>Attendance Rate</span>
                      <span class="text-gold font-bold">66.7%</span>
                    </div>
                    <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div class="h-full bg-gold rounded-full" style="width: 66.7%" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== BUILT FOR ACCOUNTABILITY ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <!-- Left: Mock interface card -->
          <div class="rounded-2xl border border-line bg-paper-panel shadow-lg overflow-hidden">
            <div class="bg-navy px-4 py-3 flex items-center gap-2">
              <div class="flex gap-1.5">
                <div class="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                <div class="w-2.5 h-2.5 rounded-full bg-green-400/60" />
              </div>
              <div class="ml-2 text-[10px] font-mono text-white/40 uppercase tracking-wider">About the System</div>
            </div>
            <div class="p-6">
              <!-- USC header bar -->
              <div class="flex items-center gap-3 mb-5 pb-4 border-b border-line">
                <div class="w-10 h-10 rounded-full bg-navy border border-gold/40 flex items-center justify-center">
                  <span class="text-gold font-bold text-xs">USC</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-navy">USC Attendance System</div>
                  <div class="text-[10px] text-slate font-mono">ISUFST Dingle Campus</div>
                </div>
              </div>
              <!-- Quick stats -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="bg-navy/5 rounded-xl p-4 text-center border border-line/50">
                  <div class="text-2xl font-bold text-navy font-serif">100%</div>
                  <div class="text-xs text-slate mt-1">Verified Check-ins</div>
                </div>
                <div class="bg-navy/5 rounded-xl p-4 text-center border border-line/50">
                  <div class="text-2xl font-bold text-navy font-serif">0</div>
                  <div class="text-xs text-slate mt-1">Editable Records</div>
                </div>
              </div>
              <!-- Feature list -->
              <div class="space-y-2">
                <div v-for="item in ['Accurate attendance recording', 'Real-time verification', 'Reduced manual workload', 'Improved accountability', 'Secure and audit ready', 'Accessible anytime, anywhere']"
                  :key="item"
                  class="flex items-center gap-2 text-sm text-slate"
                >
                  <svg class="w-4 h-4 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  {{ item }}
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Text content -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">About the System</div>
            <h2 class="text-3xl md:text-4xl font-bold font-serif text-navy mb-6">
              Built for Accountability.<br>Designed for Excellence.
            </h2>
            <p class="text-slate leading-relaxed mb-4">
              The USC Attendance System helps streamline attendance recording through geolocation and QR technology — ensuring transparency, accuracy, and efficiency in every event and office duty.
            </p>
            <p class="text-slate leading-relaxed mb-8">
              Designed exclusively for ISUFST Dingle Campus USC officers, this system replaces manual sign-in sheets with a robust digital audit trail that officers, staff, and administrators can trust.
            </p>
            <router-link
              to="/features"
              class="inline-flex items-center gap-2 text-sm font-semibold text-navy hover:text-gold-dark transition-colors"
            >
              Explore Features
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== CORE FEATURES ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Core Features</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">
            Powerful features built for<br class="hidden sm:block"> modern attendance management.
          </h2>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div
            v-for="feature in coreFeatures"
            :key="feature.title"
            class="flex flex-col items-center text-center p-5 rounded-xl border border-line bg-paper-panel shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default"
          >
            <!-- Calendar icon -->
            <div class="w-12 h-12 rounded-xl bg-navy/5 border border-line flex items-center justify-center mb-3">
              <svg v-if="feature.icon === 'calendar'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <svg v-else-if="feature.icon === 'qr'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4h6v6H4V4zm0 10h6v6H4v-6zm10-10h6v6h-6V4zm0 10h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4-2h2v4h-4v-2h2v-2z"/>
              </svg>
              <svg v-else-if="feature.icon === 'building'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
              <svg v-else-if="feature.icon === 'wifi'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/>
              </svg>
              <svg v-else-if="feature.icon === 'csv'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <svg v-else-if="feature.icon === 'audit'" class="w-6 h-6 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <p class="text-xs font-bold text-navy leading-tight">{{ feature.title }}</p>
            <p class="text-[10px] text-slate mt-1 leading-snug hidden md:block">{{ feature.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== FAQ ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-3xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Support</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Frequently Asked Questions</h2>
          <p class="text-slate mt-3 text-sm">Find answers to common questions about the USC Attendance System.</p>
        </div>

        <div class="space-y-2">
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
                class="w-4 h-4 text-slate shrink-0 transition-transform duration-200"
                :class="activeFaq === i ? 'rotate-180' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 max-h-0"
              enter-to-class="opacity-100 max-h-40"
              leave-active-class="transition-all duration-150 ease-in"
              leave-from-class="opacity-100 max-h-40"
              leave-to-class="opacity-0 max-h-0"
            >
              <div
                v-show="activeFaq === i"
                class="px-5 pb-4 text-sm text-slate leading-relaxed border-t border-line/50"
              >
                <div class="pt-3">{{ faq.answer }}</div>
              </div>
            </transition>
          </div>
        </div>

        <div class="text-center mt-8">
          <router-link
            to="/faq"
            class="inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold-dark transition-colors"
          >
            View all questions
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== CTA / SIGN IN ========== -->
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
          class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gold text-navy font-bold shadow-lg shadow-gold/20 hover:brightness-110 transition-all"
        >
          Sign In to Portal
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </button>
      </div>
    </section>
  </div>
</template>
