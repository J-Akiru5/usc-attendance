<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const rememberMe = ref(false)
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = 'Please enter email and password'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await auth.login(email.value, password.value)
    router.push('/dashboard')
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex-1 flex min-h-screen">
    <!-- Left panel: Branding -->
    <div class="hidden lg:flex lg:w-1/2 bg-navy flex-col justify-between p-12 relative overflow-hidden">
      <!-- Grid texture -->
      <div
        class="absolute inset-0 opacity-[0.04]"
        style="
          background-image:
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
          background-size: 40px 40px;
        "
      />
      <div class="absolute inset-0 bg-gradient-to-br from-navy via-navy to-navy-deep" />

      <!-- Top logos -->
      <div class="relative z-10 flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-white/10 border-2 border-gold/70 flex items-center justify-center">
          <span class="text-gold font-bold text-[10px] font-serif">ISUFST</span>
        </div>
        <div class="w-px h-8 bg-white/20" />
        <div class="w-12 h-12 rounded-full bg-gold border-2 border-gold flex items-center justify-center">
          <span class="text-navy font-bold text-sm font-serif">USC</span>
        </div>
        <div>
          <div class="text-sm font-bold text-white leading-tight">University Student Council</div>
          <div class="text-[10px] text-white/50 font-mono uppercase tracking-wider">ISUFST Dingle Campus</div>
        </div>
      </div>

      <!-- Center content -->
      <div class="relative z-10">
        <div class="text-xs font-mono uppercase tracking-widest text-gold mb-4">Attendance Portal</div>
        <h1 class="text-4xl font-bold font-serif text-white mb-4 leading-tight">
          Secure Attendance<br>Management
        </h1>
        <p class="text-white/60 text-base leading-relaxed mb-10">
          Official attendance tracking for USC officers of ISUFST Dingle Campus. Built for accountability and transparency.
        </p>

        <!-- Feature list -->
        <div class="space-y-3">
          <div v-for="item in ['GPS-verified check-ins', 'QR code attendance', 'Offline-ready PWA', 'Immutable audit trail']" :key="item"
            class="flex items-center gap-3 text-sm text-white/70"
          >
            <div class="w-5 h-5 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center shrink-0">
              <svg class="w-3 h-3 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            {{ item }}
          </div>
        </div>
      </div>

      <!-- Bottom note -->
      <div class="relative z-10">
        <p class="text-xs text-white/30 font-mono">
          © 2026 USC Attendance System · Developed by Syntaxure Labs
        </p>
      </div>
    </div>

    <!-- Right panel: Login form -->
    <div class="flex-1 flex items-center justify-center p-6 bg-paper">
      <div class="w-full max-w-sm">
        <!-- Mobile logos (only shown on mobile) -->
        <div class="flex lg:hidden items-center justify-center gap-3 mb-8">
          <div class="w-12 h-12 rounded-full bg-navy border-2 border-gold/70 flex items-center justify-center">
            <span class="text-gold font-bold text-[10px] font-serif">ISUFST</span>
          </div>
          <div class="w-px h-8 bg-line" />
          <div class="w-12 h-12 rounded-full bg-gold border-2 border-gold flex items-center justify-center">
            <span class="text-navy font-bold text-sm font-serif">USC</span>
          </div>
        </div>

        <!-- Form header -->
        <div class="mb-8">
          <h2 class="text-2xl font-bold font-serif text-navy mb-1">USC Attendance System</h2>
          <p class="text-sm text-slate">Sign in to your account</p>
        </div>

        <!-- Error -->
        <div v-if="error" class="mb-5 rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
          {{ error }}
        </div>

        <!-- Form -->
        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Email -->
          <div>
            <label for="email" class="block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <input
                id="email"
                v-model="email"
                type="email"
                placeholder="officer@usc.edu.ph"
                :disabled="loading"
                class="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          <!-- Password -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label for="password" class="block text-[10px] font-bold text-navy uppercase tracking-wider">
                Password
              </label>
              <span class="text-[10px] text-slate hover:text-navy cursor-pointer transition-colors">Forgot password?</span>
            </div>
            <div class="relative">
              <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <input
                id="password"
                v-model="password"
                type="password"
                placeholder="••••••••"
                :disabled="loading"
                class="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          <!-- Remember me -->
          <div class="flex items-center gap-2">
            <input
              id="remember"
              v-model="rememberMe"
              type="checkbox"
              class="w-4 h-4 rounded border-line accent-navy cursor-pointer"
            />
            <label for="remember" class="text-sm text-slate cursor-pointer">Remember me</label>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 rounded-lg bg-gold text-navy font-bold text-sm hover:brightness-110 transition-all shadow-md shadow-gold/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>

        <!-- Footer note -->
        <p class="text-center text-xs text-slate mt-6">
          For authorized USC officers only.
        </p>
      </div>
    </div>
  </div>
</template>
