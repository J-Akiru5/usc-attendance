<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import Toast from '@/components/ui/Toast.vue'

const auth = useAuthStore()
const router = useRouter()

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)
const showConfirm = ref(false)
const toastRef = ref<InstanceType<typeof Toast>>()

async function handleChangePassword() {
  error.value = ''

  if (!newPassword.value || !confirmPassword.value) {
    error.value = 'Please fill in both fields'
    return
  }

  if (newPassword.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  loading.value = true

  try {
    await api.post('/auth/change-password', { newPassword: newPassword.value })

    // Refresh user data to get updated mustChangePassword: false
    await auth.fetchUser()

    toastRef.value?.addToast('Password changed successfully', 'success')
    router.push('/dashboard')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to change password'
    error.value = msg
    toastRef.value?.addToast(msg, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex-1 flex min-h-screen">
    <!-- Left panel: Branding -->
    <div class="hidden lg:flex lg:w-1/2 bg-navy flex-col justify-between p-12 relative overflow-hidden">
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
        <img src="/logo/ISUFST_logo.webp" alt="ISUFST Logo" class="w-12 h-12 rounded-full object-contain bg-white/10 p-0.5 border-2 border-gold/70 shrink-0" />
        <div class="w-px h-8 bg-white/20" />
        <img src="/logo/USC_logo.webp" alt="USC Logo" class="w-12 h-12 rounded-full object-cover border-2 border-gold shrink-0" />
        <div>
          <div class="text-sm font-bold text-white leading-tight">University Student Council</div>
          <div class="text-[10px] text-white/50 font-mono uppercase tracking-wider">ISUFST Dingle Campus</div>
        </div>
      </div>

      <!-- Center content -->
      <div class="relative z-10">
        <div class="text-xs font-mono uppercase tracking-widest text-gold mb-4">Security Required</div>
        <h1 class="text-4xl font-bold font-serif text-white mb-2 leading-tight">
          Change Your Password
        </h1>
        <p class="text-white/60 text-base leading-relaxed mb-10">
          Your temporary password must be changed before you can access the system. Choose a strong, unique password.
        </p>

        <div class="space-y-3">
          <div v-for="item in ['At least 8 characters', 'Use a mix of letters, numbers, and symbols', 'Do not reuse old passwords']" :key="item"
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

      <div class="relative z-10">
        <p class="text-xs text-white/30 font-mono">
          © 2026 USC Digital Portal · Developed by Syntaxure Labs
        </p>
      </div>
    </div>

    <!-- Right panel: Change password form -->
    <div class="flex-1 flex items-center justify-center p-6 bg-paper relative">
      <div class="w-full max-w-sm">
        <!-- Mobile logos -->
        <div class="flex lg:hidden items-center justify-center gap-3 mb-8">
          <img src="/logo/ISUFST_logo.webp" alt="ISUFST Logo" class="w-12 h-12 rounded-full object-contain bg-white/10 p-0.5 border-2 border-gold/70 shrink-0" />
          <div class="w-px h-8 bg-line" />
          <img src="/logo/USC_logo.webp" alt="USC Logo" class="w-12 h-12 rounded-full object-cover border-2 border-gold shrink-0" />
        </div>

        <!-- Header -->
        <div class="mb-8">
          <h2 class="text-2xl font-bold font-serif text-navy mb-1">Change Password</h2>
          <p class="text-sm text-slate">You must change your password to continue</p>
        </div>

        <!-- Error -->
        <div v-if="error" class="mb-5 rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
          {{ error }}
        </div>

        <!-- Form -->
        <form @submit.prevent="handleChangePassword" class="space-y-4">
          <!-- New Password -->
          <div>
            <label for="newPassword" class="block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5">
              New Password
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <input
                id="newPassword"
                v-model="newPassword"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••"
                :disabled="loading"
                class="w-full pl-10 pr-10 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors disabled:opacity-60"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute inset-y-0 right-3 flex items-center text-slate hover:text-navy transition-colors"
                tabindex="-1"
              >
                <svg v-if="!showPassword" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.879L21 21"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.879L21 21"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Confirm Password -->
          <div>
            <label for="confirmPassword" class="block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5">
              Confirm Password
            </label>
            <div class="relative">
              <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-slate" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </div>
              <input
                id="confirmPassword"
                v-model="confirmPassword"
                :type="showConfirm ? 'text' : 'password'"
                placeholder="••••••••"
                :disabled="loading"
                class="w-full pl-10 pr-10 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors disabled:opacity-60"
              />
              <button
                type="button"
                @click="showConfirm = !showConfirm"
                class="absolute inset-y-0 right-3 flex items-center text-slate hover:text-navy transition-colors"
                tabindex="-1"
              >
                <svg v-if="!showConfirm" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.879L21 21"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.879L21 21"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full py-3 rounded-lg bg-gold text-navy font-bold text-sm hover:brightness-110 transition-all shadow-md shadow-gold/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {{ loading ? 'Changing password...' : 'Change Password' }}
          </button>
        </form>

        <!-- Logout option -->
        <p class="text-center text-xs text-slate mt-6">
          <button
            @click="auth.logout(); router.push('/login')"
            class="text-navy underline hover:text-gold transition-colors"
          >
            Log out instead
          </button>
        </p>
      </div>
    </div>
  </div>
  <Toast ref="toastRef" />
</template>
