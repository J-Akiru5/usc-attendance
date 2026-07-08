<script setup lang="ts">
import { ref } from 'vue'

const activeIndex = ref<number | null>(null)

function toggle(index: number) {
  activeIndex.value = activeIndex.value === index ? null : index
}

const faqs = [
  {
    q: 'Can students register themselves?',
    a: 'No. Only official USC officers receive accounts. Registration is managed exclusively by system administrators.',
  },
  {
    q: 'Can my QR code be reused?',
    a: 'No. Every QR token is time-limited to 60 seconds and cryptographically signed. Once scanned or expired, it cannot be used again.',
  },
  {
    q: 'Can attendance records be edited or deleted?',
    a: 'No. Attendance is append-only. Once a record is created, it cannot be modified or removed. Corrections are added as new rows with full history.',
  },
  {
    q: 'What if GPS is inaccurate?',
    a: 'Staff may manually verify attendance when geolocation is unreliable. Manual overrides are logged with the staff member\'s identity and timestamp.',
  },
  {
    q: 'What if the internet is unavailable?',
    a: 'The system queues attendance locally using IndexedDB. All pending records sync automatically when your device reconnects.',
  },
  {
    q: 'What browsers are supported?',
    a: 'Chrome, Safari, Edge, and Firefox are all fully supported. The system is designed to work on modern browsers with geolocation capabilities.',
  },
  {
    q: 'Does this work on mobile?',
    a: 'Yes. The system is a Progressive Web App (PWA), meaning it can be installed on mobile home screens and works offline.',
  },
  {
    q: 'Who can see my attendance data?',
    a: 'Only you, designated staff, and super administrators can view attendance records. Data is not shared with third parties.',
  },
  {
    q: 'How do I reset my password?',
    a: 'Contact a system administrator or the USC technical team. Password resets are handled manually for security.',
  },
  {
    q: 'Is my location tracked continuously?',
    a: 'No. The system only reads your location at the exact moment of check-in. There is no background tracking.',
  },
  {
    q: 'Can I check in for someone else?',
    a: 'No. Each check-in is tied to your authenticated account. Staff can perform manual overrides when necessary, but these are fully logged.',
  },
  {
    q: 'What data is stored in the export?',
    a: 'CSV exports include event name, officer name, check-in time, verification method (GPS or QR), and any staff override notes.',
  },
]
</script>

<template>
  <div>
    <!-- Header -->
    <section class="bg-navy text-white py-16 md:py-20">
      <div class="max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div class="text-xs font-mono uppercase tracking-wider text-gold-soft mb-3">FAQ</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Frequently Asked Questions</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          Common questions about the USC Attendance System, its security model, and how it protects officer privacy.
        </p>
      </div>
    </section>

    <!-- FAQ Accordion -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-3xl mx-auto px-4 md:px-6">
        <div class="space-y-3">
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
              <svg
                class="w-4 h-4 text-slate shrink-0 transition-transform"
                :class="activeIndex === i ? 'rotate-180' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              v-show="activeIndex === i"
              class="px-5 pb-4 text-sm text-slate leading-relaxed"
            >
              {{ faq.a }}
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
