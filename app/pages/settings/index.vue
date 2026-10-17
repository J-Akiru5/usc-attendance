<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const user = useSupabaseUser()
const toast = useToast()

const accountSchema = z.object({
  name: z.string().min(2, 'Too short'),
  email: z.email('Invalid email')
})

type AccountSchema = z.output<typeof accountSchema>

// Profile edits go through the USC API (`PUT /api/auth/profile`) once the
// auth API is ported in P1; the form is read-only until then.
const account = reactive<Partial<AccountSchema>>({
  name: '',
  email: ''
})

watchEffect(() => {
  account.name = user.value?.user_metadata?.name || ''
  account.email = user.value?.email || ''
})

function onSubmit(_event: FormSubmitEvent<AccountSchema>) {
  toast.add({
    title: 'Not available yet',
    description: 'Profile editing lands with the P1 API port.',
    icon: 'i-lucide-info',
    color: 'neutral'
  })
}
</script>

<template>
  <UForm
    id="settings"
    :schema="accountSchema"
    :state="account"
    @submit="onSubmit"
  >
    <UPageCard
      title="Account"
      description="Your USC portal account. Contact the USC to change your name or role."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        form="settings"
        label="Save changes"
        color="neutral"
        type="submit"
        disabled
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField
        name="name"
        label="Name"
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="account.name"
          autocomplete="off"
          disabled
        />
      </UFormField>
      <USeparator />
      <UFormField
        name="email"
        label="Email"
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="account.email"
          type="email"
          autocomplete="off"
          disabled
        />
      </UFormField>
    </UPageCard>
  </UForm>
</template>
