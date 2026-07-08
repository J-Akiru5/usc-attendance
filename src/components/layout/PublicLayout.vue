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
      <div class="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
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
    <footer class="bg-navy-deep text-white/60 border-t border-white/10">
      <div class="max-w-7xl mx-auto px-4 md:px-6 py-12">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <!-- Brand -->
          <div class="sm:col-span-2 lg:col-span-1">
            <div class="flex items-center gap-3 mb-4">
              <img src="/logo/ISUFST_logo.png" alt="ISUFST Logo" class="w-10 h-10 rounded-full object-contain shrink-0 bg-white/10 p-0.5 border border-gold/40" />
              <div class="w-px h-8 bg-white/20" />
              <img src="/logo/USC_logo.jpg" alt="USC Logo" class="w-10 h-10 rounded-full object-cover shrink-0 border border-gold/40" />
              <div>
                <div class="text-sm font-bold text-white leading-tight">University Student Council</div>
                <div class="text-[10px] text-white/40 font-mono">ISUFST Dingle Campus</div>
              </div>
            </div>
            <p class="text-sm text-white/40 leading-relaxed">
              Official website of the University Student Council, ISUFST Dingle Campus.
            </p>
          </div>

          <!-- About -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-white/40 mb-4">About</div>
            <div class="space-y-2">
              <router-link to="/about" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">About USC</router-link>
              <router-link to="/officers" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Officers</router-link>
              <router-link to="/projects" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Projects</router-link>
              <router-link to="/events" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Events</router-link>
            </div>
          </div>

          <!-- Officer Portal -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-white/40 mb-4">Officer Portal</div>
            <div class="space-y-2">
              <router-link to="/portal" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Portal Home</router-link>
              <router-link to="/portal/features" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Features</router-link>
              <router-link to="/portal/faq" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">FAQ</router-link>
              <router-link to="/contact" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Contact</router-link>
            </div>
          </div>

          <!-- Connect -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-white/40 mb-4">Connect</div>
            <div class="space-y-2 text-sm">
              <div class="flex items-start gap-2">
                <svg class="w-4 h-4 text-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                <a href="mailto:usc@isufst.edu.ph" class="text-white/50 hover:text-gold-soft transition-colors">usc@isufst.edu.ph</a>
              </div>
              <div class="flex items-start gap-2">
                <svg class="w-4 h-4 text-gold shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span class="text-white/50">ISUFST Dingle Campus<br>Dingle, Iloilo, Philippines</span>
              </div>
              <a href="https://www.facebook.com/profile.php?id=100094889683993" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-white/50 hover:text-gold-soft transition-colors">
                <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                USC ISUFST Dingle
              </a>
              <a href="https://isufst.edu.ph/" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-white/50 hover:text-gold-soft transition-colors">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                </svg>
                isufst.edu.ph
              </a>
            </div>
          </div>
        </div>

        <!-- Tech Sponsor -->
        <div class="mt-8 pt-6 border-t border-white/10">
          <div class="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-white/30">
            <span>Technology powered by</span>
            <a href="https://www.isufstcict.com/" target="_blank" rel="noopener noreferrer" class="text-gold-soft font-medium hover:text-gold transition-colors">
              ISUFST CICT Department
            </a>
          </div>
        </div>

        <!-- Bottom bar -->
        <div class="mt-6 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
          <div class="text-xs text-white/30">
            © 2026 University Student Council. All rights reserved.
          </div>
          <div class="text-xs text-white/30 text-center md:text-right">
            Developed by
            <a href="https://www.syntaxure.dev/" target="_blank" rel="noopener noreferrer" class="text-gold-soft font-medium hover:text-gold transition-colors">
              Jeff Edrick Martinez
            </a>
            <span class="text-white/20 mx-1">·</span>
            CEO of
            <a href="https://www.syntaxure.dev/" target="_blank" rel="noopener noreferrer" class="text-gold-soft font-medium hover:text-gold transition-colors">
              Syntaxure Labs
            </a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
