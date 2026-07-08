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
    router.push('/')
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-paper flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto w-16 h-16 rounded-full bg-navy border-3 border-gold flex items-center justify-center mb-4">
          <span class="text-gold font-bold text-lg font-serif">USC</span>
        </div>
        <h1 class="text-2xl font-bold text-navy font-serif">USC Attendance System</h1>
        <p class="text-sm text-slate mt-1">Geolocation-gated attendance tracking</p>
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

      <p class="text-center text-xs text-slate mt-6">
        University Student Council · ISUFST Dingle Campus
      </p>
    </div>
  </div>
</template>
