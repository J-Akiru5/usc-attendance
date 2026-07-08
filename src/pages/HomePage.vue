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
    answer: 'The system queues attendance locally until the connection returns. All pending records sync automatically.',
  },
  {
    question: 'Can I use the system on my mobile phone?',
    answer: 'Yes. The system is a Progressive Web App (PWA) and can be installed on your home screen and used offline.',
  },
]

const serviceFeatures = [
  'Geolocation Attendance',
  'QR Check-in',
  'Office Duty',
  'Attendance Reports',
  'Audit Trail',
]
</script>

<template>
  <div>
    <!-- ========== HERO ========== -->
    <section class="relative min-h-[600px] flex items-center overflow-hidden">
      <!-- Background image -->
      <div class="absolute inset-0">
        <img
          src="/isufst.jpg"
          alt="ISUFST Dingle Campus"
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/85 to-navy/70" />
        <div class="absolute inset-0 bg-gradient-to-t from-navy/60 via-transparent to-navy/30" />
      </div>

      <div class="relative max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20 w-full">
        <div class="max-w-2xl">
          <!-- Logos -->
          <div class="flex items-center gap-4 mb-8">
            <div class="w-14 h-14 rounded-full bg-white/10 border-2 border-gold/60 flex items-center justify-center backdrop-blur-sm">
              <span class="text-gold font-bold text-xs font-serif">ISUFST</span>
            </div>
            <div class="h-8 w-px bg-white/20" />
            <div class="w-14 h-14 rounded-full bg-gold border-2 border-gold flex items-center justify-center">
              <span class="text-navy font-bold text-base font-serif">USC</span>
            </div>
          </div>

          <!-- Title -->
          <div class="text-xs font-mono uppercase tracking-widest text-gold mb-3">University Student Council</div>
          <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold font-serif text-white leading-tight mb-3">
            USC Digital Portal
          </h1>
          <p class="text-base md:text-lg text-white/60 mb-2">Official Digital Platform</p>
          <p class="text-sm text-white/40 font-mono uppercase tracking-wider mb-8">ISUFST Dingle Campus</p>

          <p class="text-white/70 text-base md:text-lg leading-relaxed mb-10 max-w-lg">
            Modern digital services designed for the University Student Council.
          </p>

          <!-- CTA -->
          <button
            @click="router.push('/login')"
            class="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-lg shadow-gold/20 hover:brightness-110 transition-all"
          >
            Login to Portal
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </button>
        </div>
      </div>
    </section>

    <!-- ========== CURRENTLY AVAILABLE ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="text-center mb-10">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Currently Available</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-3">Attendance Management System</h2>
          <p class="text-slate text-sm max-w-lg mx-auto">Secure geolocation and QR-based attendance for authorized USC officers.</p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div
            v-for="feature in serviceFeatures"
            :key="feature"
            class="flex items-center gap-3 p-4 rounded-xl border border-line bg-paper-panel shadow-sm"
          >
            <svg class="w-5 h-5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            <span class="text-sm font-medium text-navy">{{ feature }}</span>
          </div>
        </div>

        <div class="text-center mt-10">
          <router-link
            to="/attendance"
            class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-navy text-white text-sm font-bold hover:bg-navy-deep transition-colors"
          >
            Learn More
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ========== FEATURED SERVICE ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-7xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <!-- Dashboard preview -->
          <div class="rounded-2xl border border-line bg-paper-panel shadow-lg overflow-hidden">
            <div class="bg-navy px-4 py-3 flex items-center gap-2">
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
                <span class="text-[10px] font-mono bg-gold/20 text-gold-dark px-2 py-0.5 rounded-full">3 active</span>
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
                <div class="rounded-lg border border-line/60 bg-paper p-3 text-center">
                  <div class="text-lg font-bold text-gold-dark">32</div>
                  <div class="text-[10px] text-slate font-mono uppercase">Checked In</div>
                </div>
                <div class="rounded-lg border border-line/60 bg-paper p-3 text-center">
                  <div class="text-lg font-bold text-navy">16</div>
                  <div class="text-[10px] text-slate font-mono uppercase">Pending</div>
                </div>
                <div class="rounded-lg border border-line/60 bg-paper p-3 text-center">
                  <div class="text-lg font-bold text-navy">48</div>
                  <div class="text-[10px] text-slate font-mono uppercase">Total</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Text -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Featured Service</div>
            <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-6">Attendance Management System</h2>
            <p class="text-slate leading-relaxed mb-6">
              Designed exclusively for USC officers. A secure, modern platform that replaces manual sign-in sheets with verifiable digital records.
            </p>

            <div class="space-y-3 mb-8">
              <div v-for="item in serviceFeatures" :key="item" class="flex items-center gap-3">
                <svg class="w-5 h-5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                <span class="text-sm text-navy font-medium">{{ item }}</span>
              </div>
            </div>

            <router-link
              to="/attendance"
              class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gold text-navy font-bold text-sm shadow-md shadow-gold/20 hover:brightness-110 transition-all"
            >
              Open Portal
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
              </svg>
            </router-link>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== ABOUT ========== -->
    <section class="py-16 md:py-20 bg-[#F0EDE6]">
      <div class="max-w-3xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">About the Portal</div>
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy mb-6">The official digital platform of the USC</h2>
        <p class="text-slate leading-relaxed mb-4">
          The USC Digital Portal is the official digital platform of the University Student Council of ISUFST Dingle Campus. Its purpose is to provide secure, reliable, and modern digital services for USC officers.
        </p>
        <p class="text-slate leading-relaxed mb-8">
          The Attendance Management System is the first service available on the portal. Future digital services may be added as the council's operational needs continue to evolve.
        </p>
        <router-link
          to="/about"
          class="inline-flex items-center gap-2 text-sm font-semibold text-navy hover:text-gold-dark transition-colors"
        >
          Learn more about the portal
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </router-link>
      </div>
    </section>

    <!-- ========== FAQ ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-3xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Support</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Frequently Asked Questions</h2>
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
            <div
              v-show="activeFaq === i"
              class="px-5 pb-4 text-sm text-slate leading-relaxed border-t border-line/50"
            >
              <div class="pt-3">{{ faq.answer }}</div>
            </div>
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

    <!-- ========== CTA ========== -->
    <section class="py-16 md:py-20 bg-navy text-white">
      <div class="max-w-3xl mx-auto px-4 md:px-6 text-center">
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-white mb-4">
          Ready to access the portal?
        </h2>
        <p class="text-white/70 mb-8 max-w-xl mx-auto leading-relaxed">
          Secure attendance management for authorized USC officers. Sign in to manage events, record attendance, and export reports.
        </p>
        <button
          @click="router.push('/login')"
          class="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gold text-navy font-bold shadow-lg shadow-gold/20 hover:brightness-110 transition-all"
        >
          Officer Login
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </button>
      </div>
    </section>
  </div>
</template>
