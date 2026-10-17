<script setup lang="ts">
const user = useSupabaseUser()

const name = computed(() => user.value?.user_metadata?.name || user.value?.email || 'there')
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 sm:gap-6 w-full lg:max-w-2xl mx-auto">
        <UCard>
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-landmark" class="size-8 text-primary" />
              <div>
                <h1 class="text-lg font-semibold text-highlighted">
                  Welcome, {{ name }}
                </h1>
                <p class="text-sm text-muted">
                  USC Attendance &amp; Events — ISUFST Dingle Campus
                </p>
              </div>
            </div>
          </template>

          <p class="text-sm text-muted">
            You are signed in. Dashboard modules (events, attendance, students, elections)
            are being ported to Nuxt in phase P1 of the rebuild.
          </p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
