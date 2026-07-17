<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const mobileMenuOpen = ref(false)

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
  { label: 'Officers', to: '/officers' },
  { label: 'Projects', to: '/projects' },
  { label: 'Events', to: '/events' },
  { label: 'Portal', to: '/portal' },
  { label: 'Contact', to: '/contact' },
]

const isActive = (to: string) => route.path === to

function closeMobileMenu() {
  mobileMenuOpen.value = false
}
</script>

<template>
  <div class="min-h-screen bg-paper flex flex-col">
    <!-- Navbar -->
    <header class="sticky top-0 z-50 bg-navy border-b border-white/10 shadow-lg">
      <div class="px-4 md:px-12 h-16 flex items-center justify-between gap-4">
        <!-- Logo Group -->
        <div class="flex items-center gap-3 cursor-pointer shrink-0" @click="router.push('/')">
          <!-- ISUFST Logo -->
          <div class="flex items-center gap-1.5">
            <img src="/logo/ISUFST_logo.png" alt="ISUFST Logo" class="w-9 h-9 rounded-full object-contain shrink-0 bg-white/10 p-0.5 border border-gold/30" />
          </div>
          <!-- Divider -->
          <div class="h-6 w-px bg-white/20" />
          <!-- USC Logo -->
          <div class="flex items-center gap-2">
            <img src="/logo/USC_logo.jpg" alt="USC Logo" class="w-9 h-9 rounded-full object-cover shrink-0 border border-gold/30" />
            <div class="hidden sm:block">
              <div class="text-[11px] font-bold text-white leading-tight">University Student Council</div>
              <div class="text-[9px] text-white/50 font-mono uppercase tracking-wider">ISUFST Dingle Campus</div>
            </div>
          </div>
        </div>

        <!-- Desktop Nav -->
        <nav class="hidden lg:flex items-center gap-0.5">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            :class="[
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive(link.to)
                ? 'text-gold bg-white/10'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            ]"
          >
            {{ link.label }}
          </router-link>
        </nav>

        <!-- Right Actions -->
        <div class="flex items-center gap-3 shrink-0">
          <router-link
            v-if="!auth.isAuthenticated"
            to="/login"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-navy text-sm font-bold hover:brightness-110 transition-all shadow-md"
          >
            Login
          </router-link>
          <router-link
            v-else
            to="/dashboard"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-navy text-sm font-bold hover:brightness-110 transition-all"
          >
            Dashboard
          </router-link>

          <!-- Mobile menu button -->
          <button
            class="lg:hidden p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
            @click="mobileMenuOpen = !mobileMenuOpen"
            aria-label="Toggle menu"
          >
            <svg v-if="!mobileMenuOpen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Mobile Menu -->
      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div
          v-if="mobileMenuOpen"
          class="lg:hidden border-t border-white/10 bg-navy-deep"
        >
          <nav class="px-4 py-3 space-y-1">
            <router-link
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              @click="closeMobileMenu"
              :class="[
                'block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive(link.to)
                  ? 'text-gold bg-white/10'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              ]"
            >
              {{ link.label }}
            </router-link>
          </nav>
        </div>
      </transition>
    </header>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="footer-root relative overflow-hidden">
      <!-- Gold gradient top accent line -->
      <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />

      <!-- Ambient glow blobs -->
      <div class="pointer-events-none absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-gold/5 blur-[100px]" />
      <div class="pointer-events-none absolute top-12 right-1/4 w-64 h-64 rounded-full bg-gold/3 blur-[80px]" />

      <div class="px-6 md:px-14 pt-14 pb-10 relative z-10">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          <!-- Brand -->
          <div class="sm:col-span-2 lg:col-span-1">
            <div class="flex items-center gap-3 mb-5">
              <div class="footer-logo-ring">
                <img src="/logo/ISUFST_logo.png" alt="ISUFST Logo" class="w-10 h-10 rounded-full object-contain bg-white/5 p-0.5" />
              </div>
              <div class="h-8 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
              <div class="footer-logo-ring">
                <img src="/logo/USC_logo.jpg" alt="USC Logo" class="w-10 h-10 rounded-full object-cover" />
              </div>
              <div>
                <div class="text-sm font-bold text-white leading-tight tracking-wide">University Student Council</div>
                <div class="text-[10px] text-gold/50 font-mono uppercase tracking-widest mt-0.5">ISUFST Dingle Campus</div>
              </div>
            </div>
            <p class="text-sm text-white/35 leading-relaxed max-w-xs">
              Official website of the University Student Council, ISUFST Dingle Campus.
            </p>
          </div>

          <!-- About -->
          <div>
            <div class="footer-section-label">About</div>
            <div class="space-y-1.5">
              <router-link to="/about" class="footer-link">About USC</router-link>
              <router-link to="/officers" class="footer-link">Officers</router-link>
              <router-link to="/projects" class="footer-link">Projects</router-link>
              <router-link to="/events" class="footer-link">Events</router-link>
            </div>
          </div>

          <!-- Officer Portal -->
          <div>
            <div class="footer-section-label">Officer Portal</div>
            <div class="space-y-1.5">
              <router-link to="/portal" class="footer-link">Portal Home</router-link>
              <router-link to="/portal/features" class="footer-link">Features</router-link>
              <router-link to="/portal/faq" class="footer-link">FAQ</router-link>
              <router-link to="/contact" class="footer-link">Contact</router-link>
            </div>
          </div>

          <!-- Connect -->
          <div>
            <div class="footer-section-label">Connect</div>
            <div class="space-y-2.5">
              <a href="mailto:usc@isufst.edu.ph" class="footer-contact-item">
                <span class="footer-icon-ring">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                </span>
                <span>usc@isufst.edu.ph</span>
              </a>
              <div class="footer-contact-item cursor-default">
                <span class="footer-icon-ring">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                </span>
                <span class="text-white/40 leading-snug">ISUFST Dingle Campus<br>Dingle, Iloilo, Philippines</span>
              </div>
              <a href="https://www.facebook.com/profile.php?id=100094889683993" target="_blank" rel="noopener noreferrer" class="footer-contact-item">
                <span class="footer-icon-ring">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </span>
                USC ISUFST Dingle
              </a>
              <a href="https://isufst.edu.ph/" target="_blank" rel="noopener noreferrer" class="footer-contact-item">
                <span class="footer-icon-ring">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                  </svg>
                </span>
                isufst.edu.ph
              </a>
            </div>
          </div>
        </div>

        <!-- Tech Sponsor Badge -->
        <div class="mt-10 pt-7 border-t border-white/[0.07]">
          <div class="flex items-center justify-center gap-3">
            <div class="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div class="flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm">
              <span class="text-[11px] text-white/30 tracking-wide">Technology powered by</span>
              <a href="https://www.isufstcict.com/" target="_blank" rel="noopener noreferrer"
                 class="text-[11px] font-semibold text-gold/70 hover:text-gold transition-colors duration-200 tracking-wide">
                ISUFST CICT Department
              </a>
            </div>
            <div class="h-px flex-1 bg-gradient-to-l from-transparent via-white/10 to-transparent" />
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="mt-6 pt-5 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-3">
          <div class="text-[11px] text-white/25 tracking-wide">
            © 2026 University Student Council. All rights reserved.
          </div>
          <div class="text-[11px] text-white/25 text-center md:text-right flex items-center gap-1.5 flex-wrap justify-center md:justify-end">
            <span>Developed by</span>
            <a href="https://portfolio.jeffdev.studio/" target="_blank" rel="noopener noreferrer"
               class="text-gold/60 font-semibold hover:text-gold transition-colors duration-200">
              Jeff Edrick Martinez
            </a>
            <span class="text-white/15">·</span>
            <span>CEO of</span>
            <a href="https://www.syntaxure.dev/" target="_blank" rel="noopener noreferrer"
               class="text-gold/60 font-semibold hover:text-gold transition-colors duration-200">
              Syntaxure Labs
            </a>
          </div>
        </div>
      </div>

      <!-- ── Watermark Section ── -->
      <div class="footer-watermark-section relative w-full overflow-hidden select-none pointer-events-none">
        <!-- Gradient fade-in from above -->
        <div class="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-transparent to-transparent" />
        <!-- Subtle gold ambient glow behind text -->
        <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-gold/[0.04] to-transparent blur-2xl" />

        <!-- Tagline -->
        <div class="relative z-10 flex items-center justify-center gap-4 mb-4 pt-6">
          <div class="h-px w-16 bg-gradient-to-r from-transparent to-gold/30" />
          <span class="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.5em] text-gold/30 font-semibold">
            Leadership &nbsp;•&nbsp; Service &nbsp;•&nbsp; Collaboration
          </span>
          <div class="h-px w-16 bg-gradient-to-l from-transparent to-gold/30" />
        </div>

        <!-- SVG stroke watermark text — sharp, modern outline -->
        <div class="relative z-10 w-full flex items-end justify-center overflow-hidden" style="height: clamp(64px, 13vw, 180px);">
          <svg
            class="w-full h-full"
            viewBox="0 0 1000 160"
            preserveAspectRatio="xMidYMax meet"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="wmGold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#C9A84C" stop-opacity="0.08" />
                <stop offset="35%"  stop-color="#E2C97E" stop-opacity="0.22" />
                <stop offset="65%"  stop-color="#E2C97E" stop-opacity="0.22" />
                <stop offset="100%" stop-color="#C9A84C" stop-opacity="0.08" />
              </linearGradient>
              <linearGradient id="wmGoldFill" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#C9A84C" stop-opacity="0" />
                <stop offset="50%"  stop-color="#E2C97E" stop-opacity="0.03" />
                <stop offset="100%" stop-color="#C9A84C" stop-opacity="0" />
              </linearGradient>
            </defs>
            <!-- Solid fill layer (very subtle) -->
            <text
              x="50%" y="100%"
              text-anchor="middle"
              dominant-baseline="auto"
              font-family="'Inter','SF Pro Display',system-ui,sans-serif"
              font-weight="900"
              font-size="148"
              letter-spacing="24"
              fill="url(#wmGoldFill)"
            >USC DINGLE</text>
            <!-- Stroke outline layer -->
            <text
              x="50%" y="100%"
              text-anchor="middle"
              dominant-baseline="auto"
              font-family="'Inter','SF Pro Display',system-ui,sans-serif"
              font-weight="900"
              font-size="148"
              letter-spacing="24"
              fill="none"
              stroke="url(#wmGold)"
              stroke-width="0.75"
            >USC DINGLE</text>
          </svg>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ── Footer root ── */
.footer-root {
  background-color: #0d1526;
  color: rgba(255, 255, 255, 0.55);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

/* ── Logo rings ── */
.footer-logo-ring {
  position: relative;
  padding: 2px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(201, 168, 76, 0.35), rgba(255,255,255,0.06));
  flex-shrink: 0;
}

/* ── Section labels ── */
.footer-section-label {
  font-size: 10px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(201, 168, 76, 0.45);
  font-weight: 700;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.footer-section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, rgba(201,168,76,0.15), transparent);
}

/* ── Footer nav links ── */
.footer-link {
  display: flex;
  align-items: center;
  font-size: 0.8125rem;   /* 13px */
  color: rgba(255, 255, 255, 0.42);
  padding: 0.3rem 0.5rem 0.3rem 0.75rem;
  border-radius: 0.375rem;
  border-left: 2px solid transparent;
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease, padding-left 150ms ease;
  text-decoration: none;
}
.footer-link:hover {
  color: #e2c97e;
  border-left-color: rgba(201, 168, 76, 0.5);
  background-color: rgba(201, 168, 76, 0.05);
  padding-left: 1rem;
}

/* ── Contact items ── */
.footer-contact-item {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.42);
  text-decoration: none;
  transition: color 150ms ease;
}
a.footer-contact-item:hover {
  color: #e2c97e;
}
a.footer-contact-item:hover .footer-icon-ring {
  border-color: rgba(201, 168, 76, 0.5);
  background-color: rgba(201, 168, 76, 0.1);
  color: #e2c97e;
}

/* ── Icon rings ── */
.footer-icon-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background-color: rgba(255, 255, 255, 0.04);
  color: rgba(201, 168, 76, 0.6);
  flex-shrink: 0;
  transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease;
}

/* ── Watermark section ── */
.footer-watermark-section {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: linear-gradient(to bottom, rgba(201, 168, 76, 0.015), transparent);
}
</style>
