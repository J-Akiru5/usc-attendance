<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  class?: string
  /** The id of the control this label describes (WCAG 1.3.1 / 3.3.2). */
  for?: string
}

const props = defineProps<Props>()
</script>

<template>
  <label :for="props.for" :class="cn('text-sm font-medium text-navy', props.class)">
    <slot />
  </label>
</template>
