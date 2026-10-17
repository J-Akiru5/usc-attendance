// The legacy app created its Supabase client from VITE_* env vars at import
// time; in Nuxt the client comes from @nuxtjs/supabase, so inject it into the
// ported api helper once on the client.
import { setSupabaseClient } from '~/lib/api'

export default defineNuxtPlugin(() => {
  setSupabaseClient(useSupabaseClient())
})
