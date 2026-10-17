<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, api } from '@/lib/api'
import Toast from '@/components/ui/Toast.vue'

const router = useRouter()
const welcome = new URLSearchParams(window.location.search).get('welcome') === '1'

const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)
const showPassword = ref(false)
const showConfirm = ref(false)
const waitingForRecovery = ref(true)
const toastRef = ref<InstanceType<typeof Toast>>()

let subscription: { unsubscribe: () => void } | null = null

onMounted(() => {
  // Listen for the PASSWORD_RECOVERY event from Supabase.
  // When the user clicks the reset link, Supabase processes the token in the URL hash
  // and emits this event, establishing a recovery session.
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
      waitingForRecovery.value = false
    }
  })

  subscription = data.subscription

  // Also check if there's already an active session (e.g. if the event already fired)
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      waitingForRecovery.value = false
    }
  })
})

onUnmounted(() => {
  subscription?.unsubscribe()
})

async function handleResetPassword() {
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

    // Sign out the recovery session — user will log in with new password
    await supabase.auth.signOut()

    success.value = true
    toastRef.value?.addToast('Password changed successfully! Please log in.', 'success')

    setTimeout(() => {
      router.push('/login')
    }, 2000)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reset password'
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

      <div class="relative z-10 flex items-center gap-3">
        <img src="/logo/ISUFST_logo.webp" alt="ISUFST Logo" class="w-12 h-12 rounded-full object-contain bg-white/10 p-0.5 border-2 border-gold/70 shrink-0" />
        <div class="w-px h-8 bg-white/20" />
        <img src="/logo/USC_logo.webp" alt="USC Logo" class="w-12 h-12 rounded-full object-cover border-2 border-gold shrink-0" />
        <div>
          <div class="text-sm font-bold text-white leading-tight">University Student Council</div>
          <div class="text-[10px] text-white/50 font-mono uppercase tracking-wider">ISUFST Dingle Campus</div>
        </div>
      </div>

      <div class="relative z-10">
        <div class="text-xs font-mono uppercase tracking-widest text-gold mb-4">Password Recovery</div>
        <h1 class="text-4xl font-bold font-serif text-white mb-2 leading-tight">
          {{ welcome ? 'Welcome to USC Attendance' : 'Reset Your Password' }}
        </h1>
        <p class="text-white/60 text-base leading-relaxed">
          Click the link in your email to set a new password. The link expires in 1 hour.
        </p>
      </div>

      <div class="relative z-10">
        <p class="text-xs text-white/30 font-mono">
          © 2026 USC Digital Portal · Developed by Syntaxure Labs
        </p>
      </div>
    </div>

    <!-- Right panel -->
    <div class="flex-1 flex items-center justify-center p-6 bg-paper relative">
      <div class="w-full max-w-sm">
        <!-- Mobile logos -->
        <div class="flex lg:hidden items-center justify-center gap-3 mb-8">
          <img src="/logo/ISUFST_logo.webp" alt="ISUFST Logo" class="w-12 h-12 rounded-full object-contain bg-white/10 p-0.5 border-2 border-gold/70 shrink-0" />
          <div class="w-px h-8 bg-line" />
          <img src="/logo/USC_logo.webp" alt="USC Logo" class="w-12 h-12 rounded-full object-cover border-2 border-gold shrink-0" />
        </div>

        <!-- Waiting for recovery session -->
        <div v-if="waitingForRecovery" class="text-center">
          <div class="mb-8">
            <h2 class="text-2xl font-bold font-serif text-navy mb-1">Reset Password</h2>
            <p class="text-sm text-slate">Verifying your reset link...</p>
          </div>
          <div class="flex justify-center">
            <div class="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
          <p class="text-xs text-slate mt-4">
            If this takes too long, the link may have expired. Request a new one from the login page.
          </p>
        </div>

        <!-- Success message -->
        <div v-else-if="success" class="text-center">
          <div class="w-16 h-16 rounded-full bg-green-100 border-2 border-green-400 flex items-center justify-center mx-auto mb-6">
            <svg class="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <h2 class="text-2xl font-bold font-serif text-navy mb-2">Password Changed</h2>
          <p class="text-sm text-slate">Redirecting to login...</p>
        </div>

        <!-- Password reset form -->
        <template v-else>
          <div class="mb-8">
            <h2 class="text-2xl font-bold font-serif text-navy mb-1">{{ welcome ? 'Choose Your Password' : 'Set New Password' }}</h2>
            <p class="text-sm text-slate">Choose a strong, unique password</p>
          </div>

          <div v-if="error" class="mb-5 rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
            {{ error }}
          </div>

          <form @submit.prevent="handleResetPassword" class="space-y-4">
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

            <button
              type="submit"
              :disabled="loading"
              class="w-full py-3 rounded-lg bg-gold text-navy font-bold text-sm hover:brightness-110 transition-all shadow-md shadow-gold/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {{ loading ? 'Saving...' : welcome ? 'Save Password' : 'Reset Password' }}
            </button>
          </form>

          <p class="text-center text-xs text-slate mt-6">
            <button
              @click="router.push('/login')"
              class="text-navy underline hover:text-gold transition-colors"
            >
              Back to login
            </button>
          </p>
        </template>
      </div>
    </div>
  </div>
  <Toast ref="toastRef" />
</template>
