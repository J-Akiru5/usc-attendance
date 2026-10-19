<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api'

definePageMeta({ layout: false, guest: true })

interface AcademicSection { id: string, yearLevel: number, name: string }
interface AcademicProgram { id: string, code: string, name: string, yearLevels: number, sections: AcademicSection[] }
interface AcademicCollege { id: string, code: string, name: string, programs: AcademicProgram[] }

const name = ref('')
const studentNo = ref('')
const email = ref('')
const consent = ref(false)
const loading = ref(false)
const error = ref('')
const done = ref('')

// Academic placement (plan §8.1): dropdowns come from the reference data.
const colleges = ref<AcademicCollege[]>([])
const collegeId = ref('')
const programId = ref('')
const yearLevel = ref('')
const sectionId = ref('')

const currentCollege = computed(() => colleges.value.find(c => c.id === collegeId.value) ?? null)
const programs = computed(() => currentCollege.value?.programs ?? [])
const currentProgram = computed(() => programs.value.find(p => p.id === programId.value) ?? null)
const yearLevelOptions = computed(() =>
  Array.from({ length: currentProgram.value?.yearLevels ?? 0 }, (_, i) => i + 1)
)
const sectionsForYear = computed(() =>
  (currentProgram.value?.sections ?? []).filter(s => String(s.yearLevel) === String(yearLevel.value))
)

onMounted(async () => {
  try {
    const res = await api.get<{ colleges: AcademicCollege[] }>('/reference/academic')
    colleges.value = res.colleges
  } catch {
    // The placement is optional: registration still works without the list.
  }
})

function onCollegeChange() {
  programId.value = ''
  yearLevel.value = ''
  sectionId.value = ''
}

function onProgramChange() {
  yearLevel.value = ''
  sectionId.value = ''
}

function onYearChange() {
  sectionId.value = ''
}

async function submit() {
  error.value = ''
  if (!name.value.trim() || !studentNo.value.trim() || !email.value.trim()) {
    error.value = 'Please fill in your name, student ID and school email'
    return
  }
  if (!consent.value) {
    error.value = 'Please accept the Data Privacy notice to continue'
    return
  }
  const placementComplete = collegeId.value && programId.value && yearLevel.value
  if ((collegeId.value || programId.value || yearLevel.value) && !placementComplete) {
    error.value = 'Please choose your college, program and year level'
    return
  }
  loading.value = true
  try {
    const res = await api.post<{ message: string }>('/auth/register', {
      name: name.value,
      studentNo: studentNo.value,
      email: email.value,
      consent: consent.value,
      ...(placementComplete
        ? {
            collegeId: collegeId.value,
            programId: programId.value,
            yearLevel: Number(yearLevel.value),
            sectionId: sectionId.value || null
          }
        : {})
    })
    done.value = res.message
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Sign-up failed. Please try again.'
  } finally {
    loading.value = false
  }
}

const field
  = 'w-full px-3 py-2.5 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-colors disabled:opacity-60'
const label = 'block text-[10px] font-bold text-navy uppercase tracking-wider mb-1.5'
</script>

<template>
  <main class="min-h-screen bg-paper flex items-center justify-center p-4">
    <div class="w-full max-w-md rounded-2xl border border-line bg-white p-6 sm:p-8 shadow-sm">
      <div class="mb-6">
        <div class="text-xs tracking-widest uppercase text-gold-dark font-mono mb-1">
          USC Attendance
        </div>
        <h1 class="text-2xl font-bold font-serif text-navy">
          Student sign-up
        </h1>
        <p class="text-sm text-slate mt-1">
          Use your <strong>@isufst.edu.ph</strong> email. We'll send a link to confirm it and let you choose a password.
        </p>
      </div>

      <div v-if="done" role="status" class="space-y-4">
        <div class="rounded-lg border border-gold bg-gold/10 px-4 py-3 text-sm text-navy">
          {{ done }}
        </div>
        <p class="text-xs text-slate">
          Didn't get it? Check your spam folder, or wait a few minutes and sign up again.
        </p>
        <router-link to="/login" class="inline-block text-sm text-navy underline">Back to sign in</router-link>
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <div v-if="error" role="alert" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
          {{ error }}
        </div>

        <div>
          <label for="name" :class="label">Full name</label>
          <input
            id="name"
            v-model="name"
            autocomplete="name"
            :disabled="loading"
            :class="field"
            placeholder="Juan Dela Cruz"
          >
        </div>
        <div>
          <label for="sno" :class="label">Student ID</label>
          <input
            id="sno"
            v-model="studentNo"
            autocomplete="off"
            :disabled="loading"
            :class="field"
            placeholder="22-0123"
          >
        </div>
        <div>
          <label for="college" :class="label">College (optional)</label>
          <select
            id="college"
            v-model="collegeId"
            :disabled="loading || colleges.length === 0"
            :class="field"
            @change="onCollegeChange"
          >
            <option value="">
              Not specified
            </option>
            <option v-for="c in colleges" :key="c.id" :value="c.id">
              {{ c.code }} — {{ c.name }}
            </option>
          </select>
        </div>
        <div v-if="collegeId">
          <label for="prog" :class="label">Program</label>
          <select
            id="prog"
            v-model="programId"
            :disabled="loading"
            :class="field"
            @change="onProgramChange"
          >
            <option value="">
              Choose your program
            </option>
            <option v-for="p in programs" :key="p.id" :value="p.id">
              {{ p.code }} — {{ p.name }}
            </option>
          </select>
        </div>
        <div v-if="programId" class="grid grid-cols-2 gap-3">
          <div>
            <label for="year" :class="label">Year level</label>
            <select
              id="year"
              v-model="yearLevel"
              :disabled="loading"
              :class="field"
              @change="onYearChange"
            >
              <option value="">
                Year
              </option>
              <option v-for="y in yearLevelOptions" :key="y" :value="String(y)">
                {{ y }}
              </option>
            </select>
          </div>
          <div>
            <label for="sect" :class="label">Section (optional)</label>
            <select
              id="sect"
              v-model="sectionId"
              :disabled="loading || !yearLevel || sectionsForYear.length === 0"
              :class="field"
            >
              <option value="">
                {{ sectionsForYear.length ? 'Not specified' : 'None listed' }}
              </option>
              <option v-for="s in sectionsForYear" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
          </div>
        </div>
        <div>
          <label for="email" :class="label">School email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            :disabled="loading"
            :class="field"
            placeholder="juan.delacruz@isufst.edu.ph"
          >
        </div>

        <label class="flex items-start gap-2 text-xs text-slate">
          <input v-model="consent" type="checkbox" class="mt-0.5">
          <span>
            I agree that the USC may record my name, student ID, attendance, location checks and signature for event
            attendance, as described in the
            <router-link to="/privacy" class="underline text-navy" target="_blank">Data Privacy notice</router-link>.
          </span>
        </label>

        <button
          type="submit"
          :disabled="loading"
          class="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-light transition-colors disabled:opacity-60"
        >
          {{ loading ? 'Sending…' : 'Create account' }}
        </button>

        <p class="text-center text-xs text-slate">
          Already registered? <router-link to="/login" class="underline text-navy">Sign in</router-link>
        </p>
      </form>
    </div>
  </main>
</template>
