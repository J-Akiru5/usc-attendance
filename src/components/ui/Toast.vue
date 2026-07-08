<script setup lang="ts">
import { ref } from 'vue'
import { cn } from '@/lib/utils'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

const toasts = ref<Toast[]>([])

function addToast(message: string, type: Toast['type'] = 'info') {
  const id = crypto.randomUUID()
  toasts.value.push({ id, message, type })
  setTimeout(() => removeToast(id), 4000)
}

function removeToast(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

defineExpose({ addToast })

const typeStyles = {
  success: 'border-success bg-success/10 text-success',
  error: 'border-danger bg-danger/10 text-danger',
  info: 'border-navy bg-navy/10 text-navy',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="cn(
            'rounded-lg border-l-4 px-4 py-3 shadow-lg bg-paper-panel text-sm font-medium flex items-start gap-3',
            typeStyles[toast.type]
          )"
        >
          <span class="flex-1">{{ toast.message }}</span>
          <button @click="removeToast(toast.id)" class="text-slate hover:text-ink">&times;</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
