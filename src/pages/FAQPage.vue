<script setup lang="ts">
import { ref } from 'vue'

const activeIndex = ref<number | null>(null)

function toggle(index: number) {
  activeIndex.value = activeIndex.value === index ? null : index
}

const faqs = [
  {
    q: 'Can anyone register for an account?',
    a: 'No. Only official USC officers receive accounts. Registration is managed exclusively by system administrators.',
  },
  {
    q: 'Can attendance records be edited or deleted?',
    a: 'No. Attendance is append-only. Once a record is created, it cannot be modified or removed. Corrections are added as new rows with full history.',
  },
  {
    q: 'What if the internet is unavailable?',
    a: 'The system queues attendance locally using IndexedDB. All pending records sync automatically when your device reconnects.',
  },
  {
    q: 'Is geolocation always required?',
    a: 'Staff may manually verify attendance when geolocation is unreliable. Manual overrides are logged with the staff member\'s identity and timestamp.',
  },
  {
    q: 'Can I use the system on my mobile phone?',
    a: 'Yes. The system is a Progressive Web App (PWA), meaning it can be installed on mobile home screens and works offline.',
  },
  {
    q: 'Which browsers are supported?',
    a: 'Chrome, Safari, Edge, and Firefox are all fully supported. The system is designed to work on modern browsers with geolocation capabilities.',
  },
  {
    q: 'How do I reset my password?',
    a: 'Contact a system administrator or the USC technical team. Password resets are handled manually for security.',
  },
  {
    q: 'Can I check in for someone else?',
    a: 'No. Each check-in is tied to your authenticated account. Staff can perform manual overrides when necessary, but these are fully logged.',
  },
  {
    q: 'Is my location tracked continuously?',
    a: 'No. The system only reads your location at the exact moment of check-in. There is no background tracking.',
  },
  {
    q: 'What data is stored in the export?',
    a: 'CSV exports include event name, officer name, check-in time, verification method (GPS or QR), and any staff override notes.',
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
            <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">FAQ</div>
            <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Frequently Asked Questions</h1>
            <p class="text-white/70 max-w-lg leading-relaxed">
              Find answers to common questions about the USC Digital Portal and Attendance System.
            </p>
          </div>
          <!-- Illustration -->
          <div class="hidden lg:flex justify-end">
            <div class="w-56 h-44 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden">
              <div class="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent" />
              <div class="relative z-10 text-center">
                <svg class="w-16 h-16 text-gold/60 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="text-xs text-white/40 mt-2 font-mono">Questions &amp; Answers</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== FAQ ACCORDION ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-3xl mx-auto px-4 md:px-6">
        <div class="space-y-2">
          <div
            v-for="(faq, i) in faqs"
            :key="i"
            class="rounded-xl border border-line bg-paper-panel overflow-hidden shadow-sm"
          >
            <button
              @click="toggle(i)"
              class="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-navy/[0.02] transition-colors"
            >
              <span class="text-sm font-semibold text-navy pr-4">{{ faq.q }}</span>
              <div
                class="w-6 h-6 rounded-full border border-line flex items-center justify-center shrink-0 transition-colors"
                :class="activeIndex === i ? 'bg-navy border-navy' : 'bg-transparent'"
              >
                <svg
                  class="w-3 h-3 transition-all duration-200"
                  :class="activeIndex === i ? 'text-white rotate-180' : 'text-slate'"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                </svg>
              </div>
            </button>
            <div
              v-show="activeIndex === i"
              class="px-5 pb-4 text-sm text-slate leading-relaxed border-t border-line/50"
            >
              <div class="pt-3">{{ faq.a }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
