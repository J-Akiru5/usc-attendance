import { ref, onUnmounted } from 'vue'

export function useGeolocation() {
  const latitude = ref<number | null>(null)
  const longitude = ref<number | null>(null)
  const accuracy = ref<number | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  let watchId: number | null = null

  function getPosition(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'))
        return
      }

      loading.value = true
      error.value = null

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          latitude.value = pos.coords.latitude
          longitude.value = pos.coords.longitude
          accuracy.value = pos.coords.accuracy
          loading.value = false
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
        },
        (err) => {
          loading.value = false
          switch (err.code) {
            case err.PERMISSION_DENIED:
              error.value = 'Location permission denied. Please enable location access in your browser settings.'
              break
            case err.POSITION_UNAVAILABLE:
              error.value = 'Location information is unavailable.'
              break
            case err.TIMEOUT:
              error.value = 'Location request timed out.'
              break
            default:
              error.value = 'An unknown error occurred while getting location.'
          }
          reject(new Error(error.value))
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      )
    })
  }

  function startWatching() {
    if (!navigator.geolocation) return

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latitude.value = pos.coords.latitude
        longitude.value = pos.coords.longitude
        accuracy.value = pos.coords.accuracy
      },
      (err) => {
        error.value = err.message
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    )
  }

  function stopWatching() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
  }

  onUnmounted(() => {
    stopWatching()
  })

  return {
    latitude,
    longitude,
    accuracy,
    error,
    loading,
    getPosition,
    startWatching,
    stopWatching,
  }
}
