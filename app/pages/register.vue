<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/lib/api'

definePageMeta({ layout: false, guest: true })

const name = ref('')
const studentNo = ref('')
const program = ref('')
const email = ref('')
const consent = ref(false)
const loading = ref(false)
const error = ref('')
const done = ref('')

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
  loading.value = true
  try {
    const res = await api.post<{ message: string }>('/auth/register', {
      name: name.value,
      studentNo: studentNo.value,
      program: program.value,
      email: email.value,
      consent: consent.value
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
  <div class="min-h-screen bg-paper flex items-center justify-center p-4">
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

      <div v-if="done" class="space-y-4">
        <div class="rounded-lg border border-gold bg-gold/10 px-4 py-3 text-sm text-navy">
          {{ done }}
        </div>
        <p class="text-xs text-slate">
          Didn't get it? Check your spam folder, or wait a few minutes and sign up again.
        </p>
        <router-link to="/login" class="inline-block text-sm text-navy underline">Back to sign in</router-link>
      </div>

      <form v-else class="space-y-4" @submit.prevent="submit">
        <div v-if="error" class="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger">
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
          <label for="prog" :class="label">Program (optional)</label>
          <input
            id="prog"
            v-model="program"
            :disabled="loading"
            :class="field"
            placeholder="BSIT"
          >
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
  </div>
</template>
