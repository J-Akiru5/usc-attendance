<script setup lang="ts">
const sections = [
  {
    title: 'Information We Collect',
    content: 'We collect information you provide directly when using our portal, such as your name, student ID number, email address, and role. We also collect attendance data and event participation records necessary for council operations.',
  },
  {
    title: 'How We Use Your Information',
    content: 'Your information is used to manage council events, track attendance, verify officer roles, and communicate council-related announcements. We do not sell, share, or disclose your personal data to third parties except as required by law.',
  },
  {
    title: 'Data Security',
    content: 'We implement industry-standard security measures including encrypted connections (HTTPS), secure authentication via Supabase, and role-based access controls. Access to sensitive data is limited to authorized council officers and staff.',
  },
  {
    title: 'Data Retention',
    content: 'We retain your information only as long as necessary for council operations and record-keeping. Attendance records and user accounts may be archived or anonymized after your term of office ends or upon your request.',
  },
  {
    title: 'Your Rights',
    content: 'You have the right to access, update, or request deletion of your personal data. For inquiries about your data, contact the USC Secretariat through the contact information provided on this website.',
  },
  {
    title: 'Changes to This Policy',
    content: 'This privacy policy may be updated periodically. Continued use of the website and portal after changes constitutes acceptance of the updated policy.',
  },
]
</script>

<template>
  <div>
    <!-- Header -->
    <section class="relative text-white py-20 md:py-28 overflow-hidden">
      <div
        class="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style="background-image: url('/isufst.webp');"
      />
      <div class="absolute inset-0 bg-navy/75" />
      <div class="absolute inset-0" style="background: linear-gradient(135deg, rgba(12,27,54,0.95) 0%, rgba(12,27,54,0.70) 60%, rgba(12,27,54,0.40) 100%);" />
      <div class="absolute inset-x-0 bottom-0 h-24" style="background: linear-gradient(to top, rgba(12,27,54,0.8) 0%, transparent 100%);" />

      <div class="relative px-4 md:px-12">
        <div class="max-w-3xl">
          <div class="text-xs font-mono uppercase tracking-wider text-gold mb-3">Privacy</div>
          <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold font-serif mb-4 leading-tight drop-shadow-lg">
            Privacy Policy
          </h1>
          <p class="text-white/70 max-w-lg leading-relaxed">
            How the University Student Council handles, protects, and respects your personal information.
          </p>
        </div>
      </div>
    </section>

    <!-- Content -->
    <section class="py-16 md:py-20 bg-paper">
      <div class="px-4 md:px-12">
        <div class="max-w-3xl mx-auto">
          <p class="text-slate leading-relaxed mb-10">
            This Privacy Policy explains how the University Student Council (USC) of ISUFST Dingle Campus collects, uses, and protects your personal information when you use our website and Officer Portal. By using this website, you agree to the practices described in this policy.
          </p>

          <div class="space-y-8">
            <div
              v-for="(section, i) in sections"
              :key="i"
              class="rounded-xl border border-line bg-paper-panel p-6 md:p-8 shadow-sm"
            >
              <h2 class="text-lg md:text-xl font-bold font-serif text-navy mb-3">
                {{ section.title }}
              </h2>
              <p class="text-slate leading-relaxed text-sm md:text-base">
                {{ section.content }}
              </p>
            </div>
          </div>

          <div class="mt-10 p-6 rounded-xl bg-[#F0EDE6] border border-line text-center">
            <p class="text-sm text-slate leading-relaxed">
              For questions or concerns regarding your privacy, please contact us at
              <a href="mailto:usc@isufst.edu.ph" class="text-gold-dark font-semibold hover:underline">usc@isufst.edu.ph</a>.
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
