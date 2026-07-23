<script setup lang="ts">
import { ref } from 'vue'

withDefaults(
  defineProps<{
    src: string
    poster?: string
    title?: string
  }>(),
  {
    poster: undefined,
    title: undefined,
  }
)

const videoRef = ref<HTMLVideoElement | null>(null)
const isLoading = ref(true)
const hasError = ref(false)
const isPlaying = ref(false)

function onLoadedData() {
  isLoading.value = false
}

function onError() {
  isLoading.value = false
  hasError.value = true
}

function onPlay() {
  isPlaying.value = true
}

function onPause() {
  isPlaying.value = false
}

function onEnded() {
  isPlaying.value = false
}
</script>

<template>
  <div class="relative rounded-xl overflow-hidden bg-navy/95 border border-white/10 shadow-2xl">
    <!-- Loading state -->
    <div
      v-if="isLoading && !hasError"
      class="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-navy/95"
    >
      <svg class="w-8 h-8 text-gold animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span class="text-xs font-mono uppercase tracking-wider text-white/40">Loading video...</span>
    </div>

    <!-- Error state -->
    <div
      v-if="hasError"
      class="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-navy/95"
    >
      <svg class="w-10 h-10 text-slate/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      <span class="text-xs font-mono uppercase tracking-wider text-white/30">Video unavailable</span>
      <span v-if="title" class="text-sm text-white/50">{{ title }}</span>
    </div>

    <!-- Video -->
    <video
      ref="videoRef"
      :src="src"
      :poster="poster"
      :title="title"
      :playsinline="true"
      :controls="!isLoading && !hasError"
      preload="metadata"
      class="w-full aspect-video object-contain bg-black"
      @loadeddata="onLoadedData"
      @error="onError"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
    />
  </div>
</template>
