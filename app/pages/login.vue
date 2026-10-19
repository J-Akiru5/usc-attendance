<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'

definePageMeta({
  layout: 'auth'
})

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required')
})

type Schema = z.infer<typeof schema>

const state = reactive<Schema>({
  email: '',
  password: ''
})

const supabase = useSupabaseClient()
const toast = useToast()
const loading = ref(false)

async function onSubmit(_event: FormSubmitEvent<Schema>) {
  loading.value = true
  const { error } = await supabase.auth.signInWithPassword({
    email: state.email,
    password: state.password
  })
  loading.value = false

  if (error) {
    toast.add({
      title: 'Sign in failed',
      description: error.message,
      color: 'error'
    })
    return
  }

  const redirect = useSupabaseCookieRedirect()
  await navigateTo(redirect.pluck() || '/')
}
</script>

<template>
  <UCard class="w-full max-w-sm" :ui="{ body: 'flex flex-col gap-4 p-6 sm:p-8' }">
    <div class="text-center">
      <h1 class="text-xl font-semibold text-highlighted">
        Sign in
      </h1>
      <p class="mt-1 text-sm text-muted">
        Use your USC-issued email account.
      </p>
    </div>

    <UForm
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UFormField label="Email" name="email" required>
        <UInput
          v-model="state.email"
          type="email"
          name="email"
          autocomplete="username"
          placeholder="you@isufst.edu.ph"
          class="w-full"
          size="lg"
          autofocus
        />
      </UFormField>

      <UFormField label="Password" name="password" required>
        <UInput
          v-model="state.password"
          type="password"
          name="password"
          autocomplete="current-password"
          placeholder="••••••••"
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
        label="Sign in"
      />
    </UForm>

    <p class="text-center text-sm text-muted">
      Forgot your password?
      <NuxtLink to="/reset-password" class="text-primary font-medium underline hover:underline">
        Reset it
      </NuxtLink>
    </p>
  </UCard>
</template>
