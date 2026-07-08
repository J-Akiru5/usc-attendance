<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import L from 'leaflet'
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
let map: L.Map | null = null
let marker: L.Marker | null = null
let circle: L.Circle | null = null

const DEFAULT_LAT = 10.6895
const DEFAULT_LNG = 122.9550
const DEFAULT_ZOOM = 16

function createMap() {
  if (!mapContainer.value || map) return

  map = L.map(mapContainer.value, {
    center: [props.modelLat ?? DEFAULT_LAT, props.modelLng ?? DEFAULT_LNG],
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

  if (props.modelLat !== null && props.modelLng !== null) {
    placeMarker(props.modelLat, props.modelLng)
  }

  nextTick(() => {
    map?.invalidateSize()
  })
}

function handleMapClick(e: L.LeafletMouseEvent) {
  const { lat, lng } = e.latlng
  placeMarker(lat, lng)
  emit('update:modelLat', Math.round(lat * 10000) / 10000)
  emit('update:modelLng', Math.round(lng * 10000) / 10000)
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
        emit('update:modelLat', Math.round(pos.lat * 10000) / 10000)
        emit('update:modelLng', Math.round(pos.lng * 10000) / 10000)
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

watch(
  () => props.radiusMeters,
  (newRadius) => {
    if (circle && props.modelLat !== null && props.modelLng !== null) {
      circle.setRadius(newRadius)
    }
  }
)

watch(
  () => [props.modelLat, props.modelLng] as const,
  ([lat, lng]) => {
    if (lat !== null && lng !== null && map) {
      placeMarker(lat, lng)
      if (!marker) {
        map.setView([lat, lng], DEFAULT_ZOOM)
      }
    }
  }
)

onMounted(() => {
  nextTick(() => {
    createMap()
  })
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="space-y-2">
    <div
      ref="mapContainer"
      class="rounded-xl border border-line overflow-hidden z-0"
      :style="{ height }"
    />
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
      {{ readonly ? 'No location set' : 'Click on the map to pin a location' }}
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
