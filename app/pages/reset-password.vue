<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

// Accessible while signed out (request form) and while a Supabase recovery
// session is active (set-new-password form).
definePageMeta({
  layout: 'auth'
})

const requestSchema = z.object({
  email: z.email('Enter a valid email address')
})
type RequestSchema = z.output<typeof requestSchema>

const resetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string()
}).refine(data => data.password === data.confirm, {
  message: 'Passwords do not match',
  path: ['confirm']
})
type ResetSchema = z.output<typeof resetSchema>

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

const requestState = reactive<RequestSchema>({ email: '' })
const resetState = reactive<ResetSchema>({ password: '', confirm: '' })

const requested = ref(false)
const loading = ref(false)
const done = ref(false)

async function onRequest(_event: FormSubmitEvent<RequestSchema>) {
  loading.value = true
  const { error } = await supabase.auth.resetPasswordForEmail(requestState.email, {
    redirectTo: `${useRequestURL().origin}/reset-password`
  })
  loading.value = false

  if (error) {
    toast.add({ title: 'Could not send reset link', description: error.message, color: 'error' })
    return
  }

  requested.value = true
}

async function onReset(_event: FormSubmitEvent<ResetSchema>) {
  loading.value = true
  const { error } = await supabase.auth.updateUser({ password: resetState.password })
  loading.value = false

  if (error) {
    toast.add({ title: 'Could not update password', description: error.message, color: 'error' })
    return
  }

  done.value = true
  toast.add({ title: 'Password updated', description: 'You can now sign in.', color: 'success' })
  await navigateTo('/login')
}
</script>

<template>
  <UCard class="w-full max-w-sm" :ui="{ body: 'flex flex-col gap-4 p-6 sm:p-8' }">
    <!-- Recovery session active: set a new password -->
    <template v-if="done">
      <div class="text-center">
        <h1 class="text-xl font-semibold text-highlighted">
          Password updated
        </h1>
        <p class="mt-1 text-sm text-muted">
          Redirecting you to sign in…
        </p>
      </div>
    </template>

    <template v-else-if="user">
      <div class="text-center">
        <h1 class="text-xl font-semibold text-highlighted">
          Set a new password
        </h1>
        <p class="mt-1 text-sm text-muted">
          Choose a password of at least 8 characters.
        </p>
      </div>

      <UForm
        :schema="resetSchema"
        :state="resetState"
        class="flex flex-col gap-4"
        @submit="onReset"
      >
        <UFormField label="New password" name="password" required>
          <UInput
            v-model="resetState.password"
            type="password"
            autocomplete="new-password"
            class="w-full"
            size="lg"
            autofocus
          />
        </UFormField>

        <UFormField label="Confirm password" name="confirm" required>
          <UInput
            v-model="resetState.confirm"
            type="password"
            autocomplete="new-password"
            class="w-full"
            size="lg"
          />
        </UFormField>

        <UButton
          type="submit"
          color="primary"
          size="lg"
          block
          :loading="loading"
          label="Update password"
        />
      </UForm>
    </template>

    <!-- Signed out: request a reset link -->
    <template v-else-if="requested">
      <div class="text-center">
        <h1 class="text-xl font-semibold text-highlighted">
          Check your email
        </h1>
        <p class="mt-1 text-sm text-muted">
          If an account exists for {{ requestState.email }}, a reset link is on its way.
        </p>
      </div>

      <UButton
        color="neutral"
        variant="outline"
        block
        label="Back to sign in"
        to="/login"
      />
    </template>

    <template v-else>
      <div class="text-center">
        <h1 class="text-xl font-semibold text-highlighted">
          Reset your password
        </h1>
        <p class="mt-1 text-sm text-muted">
          We'll email you a link to set a new password.
        </p>
      </div>

      <UForm
        :schema="requestSchema"
        :state="requestState"
        class="flex flex-col gap-4"
        @submit="onRequest"
      >
        <UFormField label="Email" name="email" required>
          <UInput
            v-model="requestState.email"
            type="email"
            autocomplete="username"
            placeholder="you@isufst.edu.ph"
            class="w-full"
            size="lg"
            autofocus
          />
        </UFormField>

        <UButton
          type="submit"
          color="primary"
          size="lg"
          block
          :loading="loading"
          label="Send reset link"
        />
      </UForm>

      <p class="text-center text-sm text-muted">
        Remembered it?
        <NuxtLink to="/login" class="text-primary font-medium hover:underline">
          Sign in
        </NuxtLink>
      </p>
    </template>
  </UCard>
</template>
