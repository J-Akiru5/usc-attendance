<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'gold'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  type: 'button',
})

const variants = {
  default: 'bg-navy text-white hover:bg-navy-deep',
  outline: 'border border-line bg-transparent text-ink hover:bg-paper',
  ghost: 'text-ink hover:bg-paper',
  destructive: 'bg-danger text-white hover:bg-red-800',
  gold: 'bg-gradient-to-br from-gold to-yellow-700 text-ink font-bold shadow-lg shadow-gold/30 hover:brightness-110',
}

const sizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-8 px-3 text-sm',
  lg: 'h-12 px-6 text-lg',
  icon: 'h-10 w-10',
}

const classes = computed(() =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy disabled:pointer-events-none disabled:opacity-50',
    variants[props.variant],
    sizes[props.size],
    props.class
  )
)
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled">
    <slot />
  </button>
</template>
