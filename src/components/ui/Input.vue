<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  type?: string
  placeholder?: string
  disabled?: boolean
  modelValue?: string
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const classes = computed(() =>
  cn(
    'flex h-10 w-full rounded-lg border border-line bg-paper-panel px-3 py-2 text-sm text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy disabled:cursor-not-allowed disabled:opacity-50',
    props.class
  )
)
</script>

<template>
  <input
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :value="modelValue"
    :class="classes"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
