<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'default' | 'success' | 'warning' | 'danger'
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})

const variants = {
  default: 'bg-navy/10 text-navy',
  success: 'bg-success/10 text-success',
  warning: 'bg-gold/20 text-gold-dark',
  danger: 'bg-danger/10 text-danger',
}

const classes = computed(() =>
  cn(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
    variants[props.variant],
    props.class
  )
)
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
