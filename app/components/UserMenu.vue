<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const loading = ref(false)

const name = computed(() => user.value?.user_metadata?.name || user.value?.email || 'Signed in')
const email = computed(() => user.value?.email || '')

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: name.value,
  icon: 'i-lucide-user'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings'
}], [{
  label: 'Appearance',
  icon: 'i-lucide-sun-moon',
  children: [{
    label: 'Light',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.value === 'light',
    onSelect(e: Event) {
      e.preventDefault()

      colorMode.preference = 'light'
    }
  }, {
    label: 'Dark',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onSelect(e: Event) {
      e.preventDefault()

      colorMode.preference = 'dark'
    }
  }]
}], [{
  label: 'Sign out',
  icon: 'i-lucide-log-out',
  onSelect: async () => {
    loading.value = true
    const { error } = await supabase.auth.signOut()
    loading.value = false

    if (error) {
      toast.add({ title: 'Sign out failed', description: error.message, color: 'error' })
      return
    }

    await navigateTo('/login')
  }
}]]))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      :label="collapsed ? undefined : email"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      :loading="loading"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />

    <template #leading>
      <UAvatar :alt="name" size="xs" />
    </template>
  </UDropdownMenu>
</template>
