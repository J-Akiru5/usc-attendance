<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'

const auth = useAuthStore()
const router = useRouter()

const dropdownOpen = ref(false)
const settingsOpen = ref(false)
const saving = ref(false)
const errorMsg = ref('')

const profileForm = ref({
  name: '',
  position: ''
})

// Sync form values when modal opens
watch(settingsOpen, (isOpen) => {
  if (isOpen && auth.user) {
    profileForm.value.name = auth.user.name
    profileForm.value.position = auth.user.position
    errorMsg.value = ''
  }
})

async function handleLogout() {
  dropdownOpen.value = false
  await auth.logout()
  router.push('/login')
}

function openSettings() {
  dropdownOpen.value = false
  settingsOpen.value = true
}

async function saveSettings() {
  if (!profileForm.value.name.trim() || !profileForm.value.position.trim()) {
    errorMsg.value = 'Name and position cannot be empty'
    return
  }

  saving.value = true
  errorMsg.value = ''
  try {
    await auth.updateProfile(profileForm.value.name, profileForm.value.position)
    settingsOpen.value = false
  } catch (err: any) {
    errorMsg.value = err.message || 'Failed to update profile'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <header class="bg-paper-panel border-b border-line px-4 md:px-6 py-3 flex items-center justify-between relative">
    <!-- Left Logo & Branding (Mobile only) -->
    <div class="flex items-center gap-3 md:hidden">
      <img src="/logo/USC_logo.webp" alt="USC Logo" class="w-8 h-8 rounded-full object-cover border border-gold" />
      <span class="text-xs font-mono tracking-widest uppercase text-navy">Attendance</span>
    </div>

    <div class="hidden md:block" />

    <!-- Right Profile / Dropdown Action -->
    <div class="flex items-center gap-3 relative">
      <!-- Clickable Profile Trigger -->
      <button 
        @click="dropdownOpen = !dropdownOpen" 
        class="flex items-center gap-3 text-left hover:opacity-80 transition-all p-1.5 rounded-lg hover:bg-paper focus:outline-none"
      >
        <div class="text-right hidden sm:block">
          <div class="text-sm font-semibold text-navy">{{ auth.user?.name }}</div>
          <div class="text-xs text-slate">{{ auth.user?.position }}</div>
        </div>
        
        <!-- Avatar Circle with Initial -->
        <div class="w-9 h-9 rounded-full bg-navy text-gold-soft border border-gold flex items-center justify-center font-bold text-sm shadow-sm">
          {{ auth.user?.name ? auth.user.name.charAt(0).toUpperCase() : 'U' }}
        </div>
      </button>

      <!-- Dropdown Backdrop -->
      <div v-if="dropdownOpen" class="fixed inset-0 z-40" @click="dropdownOpen = false" />

      <!-- Dropdown Menu Card -->
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div 
          v-if="dropdownOpen" 
          class="absolute right-0 top-full mt-2 w-64 rounded-xl bg-white border border-line shadow-lg py-2 z-50 overflow-hidden"
        >
          <!-- User Details Summary -->
          <div class="px-4 py-3 border-b border-line">
            <p class="text-[10px] text-slate font-mono uppercase tracking-wider">Signed in as</p>
            <p class="text-sm font-semibold text-navy mt-1 truncate">{{ auth.user?.name }}</p>
            <p class="text-xs text-slate truncate">{{ auth.user?.email }}</p>
            <div class="mt-2">
              <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-navy/10 text-navy capitalize">
                {{ auth.user?.role.replace('_', ' ') }}
              </span>
            </div>
          </div>

          <!-- Menu Links -->
          <div class="py-1">
            <button 
              @click="openSettings" 
              class="w-full text-left px-4 py-2.5 text-sm text-navy hover:bg-paper flex items-center gap-2.5 transition-colors"
            >
              <span class="text-base">⚙️</span> Settings & Profile
            </button>
          </div>

          <div class="border-t border-line py-1">
            <button 
              @click="handleLogout" 
              class="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-danger/5 flex items-center gap-2.5 transition-colors font-medium"
            >
              <span class="text-base">🚪</span> Logout
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- Settings & Profile Modal -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div 
        v-if="settingsOpen" 
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/40 backdrop-blur-sm"
      >
        <div class="bg-white rounded-2xl border border-line shadow-2xl max-w-md w-full overflow-hidden">
          <!-- Modal Header -->
          <div class="p-6 border-b border-line flex items-center justify-between">
            <h3 class="font-serif text-lg font-bold text-navy">Account Settings</h3>
            <button @click="settingsOpen = false" class="text-slate hover:text-navy text-xl font-medium focus:outline-none">✕</button>
          </div>
          
          <!-- Modal Body -->
          <div class="p-6 space-y-4">
            <!-- Error Banner -->
            <div v-if="errorMsg" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
              {{ errorMsg }}
            </div>

            <div class="space-y-2">
              <label class="text-[10px] font-bold text-navy uppercase tracking-wider block">Full Name</label>
              <input 
                v-model="profileForm.name" 
                type="text" 
                placeholder="Enter full name"
                class="w-full px-3.5 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold" 
              />
            </div>
            
            <div class="space-y-2">
              <label class="text-[10px] font-bold text-navy uppercase tracking-wider block">Council Position</label>
              <input 
                v-model="profileForm.position" 
                type="text" 
                placeholder="Enter council position"
                class="w-full px-3.5 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold" 
              />
            </div>
            
            <div class="bg-paper p-4 rounded-xl space-y-2 border border-line/50">
              <div class="text-[10px] font-mono uppercase text-slate tracking-wider">System Information</div>
              <div class="text-xs text-navy flex justify-between">
                <span class="text-slate">App Version:</span> 
                <span class="font-mono font-medium">1.0.0</span>
              </div>
              <div class="text-xs text-navy flex justify-between">
                <span class="text-slate">Offline Capability:</span> 
                <span class="text-green font-semibold">Enabled (PWA)</span>
              </div>
            </div>
          </div>
          
          <!-- Modal Footer -->
          <div class="p-4 bg-paper border-t border-line flex justify-end gap-2">
            <Button variant="ghost" size="sm" @click="settingsOpen = false" :disabled="saving">Cancel</Button>
            <Button variant="gold" size="sm" @click="saveSettings" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </Button>
          </div>
        </div>
      </div>
    </transition>
  </header>
</template>

