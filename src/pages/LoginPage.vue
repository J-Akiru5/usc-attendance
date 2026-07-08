<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import CardDescription from '@/components/ui/CardDescription.vue'
import CardContent from '@/components/ui/CardContent.vue'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
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
  <div class="flex-1 flex items-center justify-center p-4 bg-paper">
    <div class="w-full max-w-md">
      <!-- Institutional Header -->
      <div class="text-center mb-8">
        <div class="flex items-center justify-center gap-6 mb-6">
          <div class="flex flex-col items-center gap-2">
            <div class="w-14 h-14 rounded-full bg-navy border-2 border-gold/60 flex items-center justify-center">
              <span class="text-gold font-bold text-sm font-serif">ISUFST</span>
            </div>
          </div>
          <div class="h-10 w-px bg-line" />
          <div class="flex flex-col items-center gap-2">
            <div class="w-14 h-14 rounded-full bg-navy border-2 border-gold/60 flex items-center justify-center">
              <span class="text-gold font-bold text-sm font-serif">USC</span>
            </div>
          </div>
        </div>

        <h1 class="text-xl font-bold text-navy font-serif leading-tight">University Student Council</h1>
        <h2 class="text-lg font-semibold text-navy mt-1">Attendance System</h2>
        <p class="text-xs text-slate font-mono uppercase tracking-wider mt-2">ISUFST Dingle Campus</p>
      </div>

      <!-- Login Card -->
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your credentials to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="handleLogin" class="space-y-4">
            <div v-if="error" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
              {{ error }}
            </div>

            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="officer@usc.edu.ph"
                :disabled="loading"
              />
            </div>

            <div class="space-y-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                v-model="password"
                type="password"
                placeholder="Enter your password"
                :disabled="loading"
              />
            </div>

            <Button type="submit" variant="gold" size="lg" class="w-full" :disabled="loading">
              {{ loading ? 'Signing in...' : 'Sign in' }}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div class="text-center mt-8 space-y-1">
        <p class="text-xs text-slate">Developed by <span class="font-semibold text-navy">Syntaxure Labs</span></p>
        <p class="text-xs text-slate/70">for the University Student Council · ISUFST Dingle Campus</p>
        <p class="text-[10px] text-slate/50 font-mono mt-2">Version 2.0</p>
      </div>
    </div>
  </div>
</template>
