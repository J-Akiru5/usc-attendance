<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: string
  class?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const classes = computed(() =>
  cn(
    'flex h-10 w-full rounded-lg border border-line bg-paper-panel px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy disabled:cursor-not-allowed disabled:opacity-50',
    props.class
  )
)
</script>

<template>
  <select :value="modelValue" :class="classes" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
    <slot />
  </select>
</template>
