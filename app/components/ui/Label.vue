<script setup lang="ts">
import { cn } from '@/lib/utils'

interface Props {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <label :class="cn('text-sm font-medium text-navy', props.class)">
    <slot />
  </label>
</template>
