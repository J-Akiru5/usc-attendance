<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const services = [
  {
    title: 'Attendance Management',
    description: 'GPS-verified event check-ins, QR code scanning, office duty tracking, and CSV report exports.',
    icon: 'check',
    active: true,
  },
  {
    title: 'Inventory Management',
    description: 'Track council assets, supplies, and equipment.',
    icon: 'box',
    active: false,
  },
  {
    title: 'Meeting Minutes',
    description: 'Record and archive official council meeting minutes.',
    icon: 'file',
    active: false,
  },
  {
    title: 'Document Repository',
    description: 'Centralized storage for official council documents.',
    icon: 'archive',
    active: false,
  },
]
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="relative text-white overflow-hidden min-h-[480px] flex items-center">
      <div
        class="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style="background-image: url('/isufst.jpg');"
      />
      <div class="absolute inset-0 bg-navy/60" />
      <div
        class="absolute inset-0"
        style="background: linear-gradient(100deg, rgba(12,27,54,0.98) 0%, rgba(12,27,54,0.92) 30%, rgba(12,27,54,0.65) 55%, rgba(12,27,54,0.15) 100%);"
      />
      <div
        class="absolute inset-x-0 bottom-0 h-40"
        style="background: linear-gradient(to top, rgba(12,27,54,0.85) 0%, transparent 100%);"
      />

      <div class="relative max-w-7xl mx-auto px-4 md:px-6 py-20 md:py-28 w-full">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <!-- Left Column -->
          <div class="lg:col-span-7">
            <div class="text-xs font-mono uppercase tracking-widest text-gold mb-5">
              Officer Portal
            </div>

            <h1 class="text-4xl md:text-5xl font-bold font-serif leading-tight mb-3 drop-shadow-lg">
              USC Digital<br>Services
            </h1>

            <p class="text-white/50 text-sm font-mono uppercase tracking-wider mb-5">
              Secure Access for Authorized Officers
            </p>

            <p class="text-white/80 text-base md:text-lg leading-relaxed mb-10 max-w-xl">
              Access attendance management, event tracking, and reporting tools designed for University Student Council officers.
            </p>

            <div class="flex flex-wrap gap-3">
              <button
                @click="router.push('/login')"
                class="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-gold text-navy font-bold text-sm shadow-xl shadow-black/30 hover:brightness-110 transition-all"
              >
                Login to Portal
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Right Column: Glassmorphic Component -->
          <div class="lg:col-span-5 flex justify-center lg:justify-end">
            <div class="relative w-full max-w-md group">
              <!-- Decorative backdrop glow -->
              <div class="absolute -inset-1 rounded-2xl bg-gradient-to-r from-gold via-gold-soft to-gold opacity-15 blur-xl group-hover:opacity-25 transition duration-1000"></div>
              
              <!-- Glassmorphic Card -->
              <div class="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-7 md:p-8 shadow-2xl overflow-hidden">
                <!-- Top Badge -->
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/10 border border-gold/20 text-gold text-[10px] font-bold font-mono uppercase tracking-wider mb-6">
                  <span class="w-1.5 h-1.5 rounded-full bg-gold animate-pulse"></span>
                  SECURE ACCESS GATEWAY
                </div>
                
                <!-- Title & Description -->
                <h3 class="text-xl font-bold font-serif text-white mb-2">Officer Access Rules</h3>
                <p class="text-white/60 text-xs leading-relaxed mb-6">Before logging in, make sure you meet the security parameters enforced system-wide.</p>
                
                <!-- Rules checklist -->
                <div class="space-y-4 mb-6">
                  <div class="flex items-start gap-3">
                    <div class="w-6 h-6 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                      <svg class="w-3.5 h-3.5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                      </svg>
                    </div>
                    <div>
                      <h4 class="text-white font-bold text-xs">Credentials Clearance</h4>
                      <p class="text-white/50 text-[11px] mt-0.5 leading-relaxed">Accounts must be created and verified by the USC System Administrator.</p>
                    </div>
                  </div>

                  <div class="flex items-start gap-3">
                    <div class="w-6 h-6 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                      <svg class="w-3.5 h-3.5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                    </div>
                    <div>
                      <h4 class="text-white font-bold text-xs">Location Enforcement</h4>
                      <p class="text-white/50 text-[11px] mt-0.5 leading-relaxed">GPS coordinates verification is required when marking attendance records.</p>
                    </div>
                  </div>

                  <div class="flex items-start gap-3">
                    <div class="w-6 h-6 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                      <svg class="w-3.5 h-3.5 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                      </svg>
                    </div>
                    <div>
                      <h4 class="text-white font-bold text-xs">Accountability Logging</h4>
                      <p class="text-white/50 text-[11px] mt-0.5 leading-relaxed">All action signatures and exports are tracked and recorded in the logs.</p>
                    </div>
                  </div>
                </div>
                
                <!-- Bottom Divider -->
                <div class="border-t border-white/10 pt-4 flex items-center justify-between text-[10px] font-mono text-white/40">
                  <span>SSL ENCRYPTED</span>
                  <span>AES-256 SECURE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Services -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="max-w-5xl mx-auto px-4 md:px-6">
        <div class="text-center mb-12">
          <div class="text-xs font-mono uppercase tracking-wider text-gold-dark mb-3">Digital Services</div>
          <h2 class="text-2xl md:text-3xl font-bold font-serif text-navy">Available Services</h2>
          <p class="text-slate mt-3 text-sm">Digital tools for council operations.</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div
            v-for="service in services"
            :key="service.title"
            class="rounded-2xl border p-6 shadow-sm transition-all"
            :class="service.active
              ? 'border-gold/40 bg-paper-panel shadow-md'
              : 'border-line bg-paper-panel/60 opacity-60'"
          >
            <div class="flex items-start gap-4">
              <div
                class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                :class="service.active ? 'bg-navy' : 'bg-navy/10'"
              >
                <svg v-if="service.icon === 'check'" class="w-5 h-5" :class="service.active ? 'text-gold' : 'text-navy/40'" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <svg v-else-if="service.icon === 'box'" class="w-5 h-5 text-navy/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
                <svg v-else-if="service.icon === 'file'" class="w-5 h-5 text-navy/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <svg v-else-if="service.icon === 'archive'" class="w-5 h-5 text-navy/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
                </svg>
              </div>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="text-base font-bold text-navy">{{ service.title }}</h3>
                  <span v-if="service.active" class="text-[10px] font-bold uppercase tracking-wider text-white bg-gold px-2 py-0.5 rounded-full">Active</span>
                  <span v-else class="text-[10px] font-bold uppercase tracking-wider text-slate bg-navy/5 px-2 py-0.5 rounded-full">Coming Soon</span>
                </div>
                <p class="text-sm text-slate leading-relaxed">{{ service.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-16 md:py-20 bg-navy text-white">
      <div class="max-w-3xl mx-auto px-4 md:px-6 text-center">
        <h2 class="text-2xl md:text-3xl font-bold font-serif text-white mb-4">
          Ready to get started?
        </h2>
        <p class="text-white/70 mb-8 max-w-xl mx-auto leading-relaxed">
          Authorized USC officers can sign in to access the attendance management system and other digital services.
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
