<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

const props = withDefaults(defineProps<{
  modelLat?: number | null
  modelLng?: number | null
  radiusMeters?: number
  readonly?: boolean
  height?: string
}>(), {
  modelLat: null,
  modelLng: null,
  radiusMeters: 50,
  readonly: false,
  height: '300px',
})

const emit = defineEmits<{
  'update:modelLat': [value: number | null]
  'update:modelLng': [value: number | null]
}>()

const mapContainer = ref<HTMLDivElement | null>(null)
const detecting = ref(false)
const locBtnText = ref('Use My Location')
const localLat = ref('')
const localLng = ref('')
let map: L.Map | null = null
let marker: L.Marker | null = null
let circle: L.Circle | null = null
let suppressSync = false
let isUnmounted = false
let statusTimer: ReturnType<typeof setTimeout> | null = null
let invalidateTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (statusTimer) { clearTimeout(statusTimer); statusTimer = null }
  if (invalidateTimer) { clearTimeout(invalidateTimer); invalidateTimer = null }
}

function setStatus(msg: string, duration: number) {
  locBtnText.value = msg
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    if (!isUnmounted) locBtnText.value = 'Use My Location'
    statusTimer = null
  }, duration)
}

const DEFAULT_LAT = 10.6895
const DEFAULT_LNG = 122.9550
const DEFAULT_ZOOM = 16

function norm(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? null : n
}

function emitCoords(lat: number, lng: number) {
  const rLat = Math.round(lat * 1000000) / 1000000
  const rLng = Math.round(lng * 1000000) / 1000000
  localLat.value = String(rLat)
  localLng.value = String(rLng)
  suppressSync = true
  emit('update:modelLat', rLat)
  emit('update:modelLng', rLng)
  nextTick(() => { suppressSync = false })
}

watch(() => props.modelLat, (val) => {
  if (suppressSync) { return }
  localLat.value = val !== null ? String(val) : ''
})

watch(() => props.modelLng, (val) => {
  localLng.value = val !== null ? String(val) : ''
})

watch(
  () => [props.modelLat, props.modelLng] as const,
  ([lat, lng]) => {
    const nlat = norm(lat)
    const nlng = norm(lng)
    if (nlat !== null && nlng !== null && map) {
      placeMarker(nlat, nlng)
      map.panTo([nlat, nlng])
    }
  },
)

watch(
  () => props.radiusMeters,
  (newRadius) => {
    if (circle && norm(props.modelLat) !== null && norm(props.modelLng) !== null) {
      circle.setRadius(newRadius)
    }
  },
)

function onFieldChange() {
  const lat = parseFloat(localLat.value)
  const lng = parseFloat(localLng.value)
  if (!isNaN(lat) && !isNaN(lng)) {
    localLat.value = String(Math.round(lat * 1000000) / 1000000)
    localLng.value = String(Math.round(lng * 1000000) / 1000000)
    suppressSync = true
    emit('update:modelLat', Math.round(lat * 1000000) / 1000000)
    emit('update:modelLng', Math.round(lng * 1000000) / 1000000)
    nextTick(() => { suppressSync = false })
  }
}

function createMap() {
  if (!mapContainer.value || map) return

  const clat = norm(props.modelLat) ?? DEFAULT_LAT
  const clng = norm(props.modelLng) ?? DEFAULT_LNG

  map = L.map(mapContainer.value, {
    center: [clat, clng],
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    attributionControl: true,
  })

  L.control.zoom({ position: 'bottomright' }).addTo(map)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map)

  if (!props.readonly) {
    map.on('click', handleMapClick)
  }

  const lat = norm(props.modelLat)
  const lng = norm(props.modelLng)
  if (lat !== null && lng !== null) {
    placeMarker(lat, lng)
  }

  nextTick(() => {
    map?.invalidateSize()
  })
}

function handleMapClick(e: L.LeafletMouseEvent) {
  const { lat, lng } = e.latlng
  placeMarker(lat, lng)
  emitCoords(lat, lng)
}

function placeMarker(lat: number, lng: number) {
  if (!map) return

  if (marker) {
    marker.setLatLng([lat, lng])
  } else {
    marker = L.marker([lat, lng], { draggable: !props.readonly }).addTo(map)
    if (!props.readonly) {
      marker.on('dragend', () => {
        const pos = marker!.getLatLng()
        emitCoords(pos.lat, pos.lng)
      })
    }
  }

  updateCircle(lat, lng)
}

function updateCircle(lat: number, lng: number) {
  if (!map) return

  if (circle) {
    circle.setLatLng([lat, lng])
    circle.setRadius(props.radiusMeters)
  } else {
    circle = L.circle([lat, lng], {
      radius: props.radiusMeters,
      color: '#142850',
      fillColor: '#142850',
      fillOpacity: 0.12,
      weight: 2,
      opacity: 0.6,
    }).addTo(map)
  }
}

function detectLocation() {
  if (detecting.value || isUnmounted) return

  if (!navigator.geolocation) {
    setStatus('Not supported', 2000)
    return
  }

  detecting.value = true
  setStatus('Detecting...', 10000)

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (isUnmounted) return
      const lat = Math.round(pos.coords.latitude * 1000000) / 1000000
      const lng = Math.round(pos.coords.longitude * 1000000) / 1000000
      emitCoords(lat, lng)
      map?.panTo([lat, lng])
      detecting.value = false
      setStatus('Location Found!', 2000)
    },
    () => {
      if (isUnmounted) return
      detecting.value = false
      setStatus('Permission Denied', 2500)
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  )
}

onMounted(() => {
  nextTick(() => {
    createMap()
    invalidateTimer = setTimeout(() => {
      if (!isUnmounted) map?.invalidateSize()
      invalidateTimer = null
    }, 300)
  })
})

onBeforeUnmount(() => {
  isUnmounted = true
  clearTimers()
  if (map) {
    map.off()
    map.remove()
    map = null
    marker = null
    circle = null
  }
})
</script>

<template>
  <div class="space-y-2">
    <!-- Map -->
    <div
      ref="mapContainer"
      class="rounded-xl border border-line overflow-hidden z-0"
      :style="{ height }"
    />

    <!-- Controls: Use My Location + Lat/Lng Inputs -->
    <div v-if="!readonly" class="space-y-2">
      <button
        type="button"
        :disabled="detecting"
        @click="detectLocation"
        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-line bg-paper-panel text-navy hover:border-gold/30 hover:text-gold-dark transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
        <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': detecting }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        {{ locBtnText }}
      </button>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="block text-[10px] font-bold text-navy uppercase tracking-wider">Latitude</label>
          <input
            v-model="localLat"
            type="number"
            step="any"
            placeholder="10.6895"
            class="w-full px-3 py-2 border border-line rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
            @change="onFieldChange"
          />
        </div>
        <div class="space-y-1">
          <label class="block text-[10px] font-bold text-navy uppercase tracking-wider">Longitude</label>
          <input
            v-model="localLng"
            type="number"
            step="any"
            placeholder="122.9550"
            class="w-full px-3 py-2 border border-line rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors"
            @change="onFieldChange"
          />
        </div>
      </div>
    </div>

    <!-- Pinned coordinate readout -->
    <div v-if="modelLat !== null && modelLng !== null" class="flex items-center gap-2 text-[11px] text-slate font-mono">
      <svg class="w-3.5 h-3.5 text-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      <span>{{ modelLat }}, {{ modelLng }}</span>
      <span class="text-slate/50">·</span>
      <span class="text-gold-dark font-semibold">Radius: {{ radiusMeters }}m</span>
    </div>
    <div v-else class="text-[11px] text-slate/60 font-mono">
      {{ readonly ? 'No location set' : 'Click on the map, enter coordinates, or use location detection' }}
    </div>
  </div>
</template>

<style>
.leaflet-control-zoom a {
  font-size: 16px !important;
  width: 32px !important;
  height: 32px !important;
  line-height: 32px !important;
}
.leaflet-control-attribution {
  font-size: 9px !important;
  opacity: 0.6;
}
</style>
