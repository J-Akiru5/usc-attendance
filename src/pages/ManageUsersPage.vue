<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import type { User } from '@/types'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Badge from '@/components/ui/Badge.vue'

const users = ref<User[]>([])
const loading = ref(true)
const error = ref('')
const toggling = ref<string | null>(null)

onMounted(async () => {
  await fetchUsers()
})

async function fetchUsers() {
  loading.value = true
  error.value = ''
  try {
    users.value = await api.get<User[]>('/auth/users')
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to load users'
  } finally {
    loading.value = false
  }
}

async function toggleContentAccess(user: User) {
  toggling.value = user.id
  try {
    const updated = await api.patch<User>(`/auth/users/${user.id}`, {
      canManageContent: !user.canManageContent,
    })
    const idx = users.value.findIndex((u) => u.id === user.id)
    if (idx !== -1) users.value[idx] = { ...users.value[idx], canManageContent: updated.canManageContent }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Failed to update'
  } finally {
    toggling.value = null
  }
}

function roleBadgeVariant(role: string) {
  if (role === 'super_admin') return 'success'
  if (role === 'staff') return 'default'
  return 'default'
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-navy font-serif">User Management</h1>
      <p class="text-sm text-slate">Grant content management access to staff members</p>
    </div>

    <div v-if="error" class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {{ error }}
    </div>

    <div v-if="loading" class="text-center text-slate py-12">Loading users...</div>

    <div v-else-if="users.length === 0" class="text-center text-slate py-12">
      No users found.
    </div>

    <template v-else>
      <!-- Staff members (super_admin + staff) -->
      <div class="mb-6">
        <h2 class="text-sm font-bold text-navy uppercase tracking-wider mb-3">Staff &amp; Admins</h2>
        <div class="space-y-2">
          <Card v-for="user in users.filter(u => u.role === 'super_admin' || u.role === 'staff')" :key="user.id">
            <CardContent class="p-4 flex items-center justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-navy truncate">{{ user.name }}</span>
                  <Badge :variant="roleBadgeVariant(user.role)">{{ user.role }}</Badge>
                </div>
                <div class="text-xs text-slate mt-0.5 truncate">{{ user.position }}</div>
                <div class="text-xs text-slate/60 mt-0.5 truncate">{{ user.email }}</div>
              </div>

              <!-- Toggle switch (super_admin always has access — disabled) -->
              <div class="flex items-center gap-2 shrink-0">
    <span class="text-[10px] font-bold uppercase tracking-wider" :class="user.role === 'super_admin' || user.canManageContent ? 'text-gold-dark' : 'text-slate/50'">
                  Content
                </span>
                <button
                  type="button"
                  :disabled="user.role === 'super_admin' || toggling === user.id"
                  :class="[
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200',
                    user.role === 'super_admin' || user.canManageContent
                      ? 'bg-gold'
                      : 'bg-slate-300',
                    (user.role === 'super_admin' || toggling === user.id) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  ]"
                  @click="user.role !== 'super_admin' && toggleContentAccess(user)"
                >
                  <span
                    :class="[
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200',
                      user.role === 'super_admin' || user.canManageContent ? 'translate-x-6' : 'translate-x-1'
                     ]" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>