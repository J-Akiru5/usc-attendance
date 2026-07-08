<script setup lang="ts">
import { ref } from 'vue'

const form = ref({
  name: '',
  email: '',
  subject: '',
  message: '',
})

const sending = ref(false)
const sent = ref(false)

async function handleSubmit() {
  if (!form.value.name || !form.value.email || !form.value.message) return
  sending.value = true
  // Simulate sending
  await new Promise(resolve => setTimeout(resolve, 1200))
  sending.value = false
  sent.value = true
}
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
        <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Contact</div>
        <h1 class="text-3xl md:text-4xl font-bold font-serif mb-4">Contact Us</h1>
        <p class="text-white/70 max-w-2xl mx-auto leading-relaxed">
          We're here to help. Reach out to the University Student Council for questions about the USC Digital Portal.
        </p>
      </div>
    </section>

    <!-- ========== CONTACT CONTENT ========== -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Left: Contact Info -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-6">University Student Council</div>
            <h2 class="text-xl font-bold font-serif text-navy mb-6">ISUFST Dingle Campus</h2>

            <div class="space-y-5">
              <!-- Email -->
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-navy/5 border border-line flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                </div>
                <div>
                  <div class="text-[10px] font-mono uppercase tracking-wider text-slate mb-1">Email</div>
                  <a href="mailto:usc@isufst.edu.ph" class="text-sm font-semibold text-navy hover:text-gold-dark transition-colors">
                    usc@isufst.edu.ph
                  </a>
                </div>
              </div>

              <!-- Office -->
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-navy/5 border border-line flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                </div>
                <div>
                  <div class="text-[10px] font-mono uppercase tracking-wider text-slate mb-1">Office</div>
                  <div class="text-sm font-semibold text-navy">ISUFST Dingle Campus</div>
                  <div class="text-sm text-slate">Student Council Office</div>
                </div>
              </div>

              <!-- Location -->
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-navy/5 border border-line flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </div>
                <div>
                  <div class="text-[10px] font-mono uppercase tracking-wider text-slate mb-1">Location</div>
                  <div class="text-sm font-semibold text-navy">Dingle, Iloilo</div>
                  <div class="text-sm text-slate">Philippines</div>
                </div>
              </div>

              <!-- Hours -->
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-navy/5 border border-line flex items-center justify-center shrink-0">
                  <svg class="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <div>
                  <div class="text-[10px] font-mono uppercase tracking-wider text-slate mb-1">Hours</div>
                  <div class="text-sm font-semibold text-navy">Monday – Friday</div>
                  <div class="text-sm text-slate">8:00 AM – 5:00 PM</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Message Form -->
          <div class="rounded-2xl border border-line bg-paper-panel p-8 shadow-sm">
            <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-4">Message</div>
            <h2 class="text-lg font-bold font-serif text-navy mb-6">Send us a message</h2>

            <!-- Success state -->
            <div v-if="sent" class="flex flex-col items-center justify-center py-12 text-center">
              <div class="w-14 h-14 rounded-full bg-green-100 border border-green-200 flex items-center justify-center mb-4">
                <svg class="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <div class="text-base font-bold text-navy mb-1">Message sent!</div>
              <p class="text-sm text-slate">We'll get back to you as soon as possible.</p>
            </div>

            <!-- Form -->
            <form v-else @submit.prevent="handleSubmit" class="space-y-4">
              <!-- Name -->
              <div>
                <label class="block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5">Your Name</label>
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="Enter your name"
                  class="w-full px-3.5 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                  required
                />
              </div>

              <!-- Email -->
              <div>
                <label class="block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  v-model="form.email"
                  type="email"
                  placeholder="officer@usc.edu.ph"
                  class="w-full px-3.5 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                  required
                />
              </div>

              <!-- Subject -->
              <div>
                <label class="block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5">Subject</label>
                <input
                  v-model="form.subject"
                  type="text"
                  placeholder="What is your message about?"
                  class="w-full px-3.5 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
                />
              </div>

              <!-- Message -->
              <div>
                <label class="block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5">Message</label>
                <textarea
                  v-model="form.message"
                  rows="4"
                  placeholder="Write your message..."
                  class="w-full px-3.5 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                :disabled="sending"
                class="w-full py-3 rounded-lg bg-gold text-navy font-bold text-sm hover:brightness-110 transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {{ sending ? 'Sending...' : 'Send Message' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
