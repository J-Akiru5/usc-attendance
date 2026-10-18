<script setup lang="ts">
import { onMounted, ref } from 'vue'

const emit = defineEmits<{ (e: 'change', dataUrl: string | null): void }>()

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let drawing = false
let last: { x: number, y: number } | null = null
let points = 0

// Internal resolution is fixed (the server accepts 100-1600 x 40-1000 px).
const W = 600
const H = 220

onMounted(() => {
  const c = canvas.value!
  c.width = W
  c.height = H
  ctx = c.getContext('2d')!
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#0b1b3a'
})

function pos(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
}

function down(e: PointerEvent) {
  e.preventDefault()
  canvas.value!.setPointerCapture(e.pointerId)
  drawing = true
  last = pos(e)
  // a tap leaves a dot
  ctx!.beginPath()
  ctx!.arc(last.x, last.y, 1.5, 0, Math.PI * 2)
  ctx!.fillStyle = '#0b1b3a'
  ctx!.fill()
  points++
}

function move(e: PointerEvent) {
  if (!drawing || !last) return
  e.preventDefault()
  const p = pos(e)
  ctx!.beginPath()
  ctx!.moveTo(last.x, last.y)
  ctx!.lineTo(p.x, p.y)
  ctx!.stroke()
  last = p
  points++
}

function up() {
  if (!drawing) return
  drawing = false
  last = null
  // Only report a signature once there is a real stroke, not a stray tap.
  emit('change', points >= 25 ? canvas.value!.toDataURL('image/png') : null)
}

function clear() {
  ctx!.clearRect(0, 0, W, H)
  points = 0
  emit('change', null)
}

defineExpose({ clear })
</script>

<template>
  <div>
    <canvas
      ref="canvas"
      class="w-full touch-none rounded-lg border-2 border-dashed border-line bg-white"
      style="aspect-ratio: 600 / 220"
      aria-label="Signature drawing area"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @pointerleave="up"
    />
    <div class="mt-1 flex justify-between text-[11px] text-slate">
      <span>Sign inside the box with your finger or mouse</span>
      <button type="button" class="underline hover:text-navy" @click="clear">
        Clear
      </button>
    </div>
  </div>
</template>
