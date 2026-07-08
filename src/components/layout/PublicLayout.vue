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
  { label: 'Features', to: '/features' },
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Security', to: '/security' },
  { label: 'FAQ', to: '/faq' },
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
    <header class="sticky top-0 z-50 bg-paper-panel/95 backdrop-blur-md border-b border-line">
      <div class="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <!-- Logo -->
        <div class="flex items-center gap-3 cursor-pointer" @click="router.push('/')">
          <div class="w-9 h-9 rounded-full bg-navy border border-gold flex items-center justify-center shrink-0">
            <span class="text-gold font-bold text-sm font-serif">USC</span>
          </div>
          <div class="hidden sm:block">
            <div class="text-xs font-bold text-navy leading-tight">University Student Council</div>
            <div class="text-[10px] text-slate font-mono uppercase tracking-wider">Attendance System</div>
          </div>
        </div>

        <!-- Desktop Nav -->
        <nav class="hidden lg:flex items-center gap-1">
          <router-link
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            :class="[
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive(link.to)
                ? 'text-navy bg-navy/5'
                : 'text-slate hover:text-navy hover:bg-navy/5'
            ]"
          >
            {{ link.label }}
          </router-link>
        </nav>

        <!-- Right Actions -->
        <div class="flex items-center gap-3">
          <router-link
            v-if="!auth.isAuthenticated"
            to="/login"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-deep transition-colors"
          >
            Sign In
          </router-link>
          <router-link
            v-else
            to="/dashboard"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-ink text-sm font-bold hover:brightness-110 transition-all"
          >
            Dashboard
          </router-link>

          <!-- Mobile menu button -->
          <button
            class="lg:hidden p-2 rounded-lg hover:bg-navy/5 text-navy transition-colors"
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
          class="lg:hidden border-t border-line bg-paper-panel"
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
                  ? 'text-navy bg-navy/5'
                  : 'text-slate hover:text-navy hover:bg-navy/5'
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Brand -->
          <div>
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-full bg-white/10 border border-gold flex items-center justify-center shrink-0">
                <span class="text-gold font-bold text-sm font-serif">USC</span>
              </div>
              <div>
                <div class="text-sm font-bold text-white">University Student Council</div>
                <div class="text-xs text-white/50 font-mono">Attendance System</div>
              </div>
            </div>
            <p class="text-sm text-white/40 leading-relaxed">
              Official attendance management platform for ISUFST Dingle Campus. Built for accountability, transparency, and efficiency.
            </p>
          </div>

          <!-- Navigation -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-white/40 mb-4">Information</div>
            <div class="space-y-2">
              <router-link
                v-for="link in navLinks"
                :key="link.to"
                :to="link.to"
                class="block text-sm text-white/50 hover:text-gold-soft transition-colors"
              >
                {{ link.label }}
              </router-link>
            </div>
          </div>

          <!-- Legal -->
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-white/40 mb-4">Legal</div>
            <div class="space-y-2">
              <router-link to="/security" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Privacy Policy</router-link>
              <router-link to="/security" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Terms of Use</router-link>
              <router-link to="/contact" class="block text-sm text-white/50 hover:text-gold-soft transition-colors">Contact</router-link>
            </div>
          </div>
        </div>

        <div class="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="text-xs text-white/30">
            <span class="font-mono">Version 2.0</span> · ISUFST Dingle Campus
          </div>
          <div class="text-xs text-white/30">
            Developed by <span class="text-gold-soft font-medium">Syntaxure Labs</span> for the University Student Council
          </div>
          <div class="text-xs text-white/30">
            © 2026 ISUFST Dingle Campus
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
