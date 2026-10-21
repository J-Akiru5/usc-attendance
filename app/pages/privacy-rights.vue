<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'

/**
 * Plain-language privacy and rights page (plan §8.9, benchmark BC-1).
 *
 * This is a description of what the deployed code actually does, not a legal
 * document and not a copy of the public /privacy notice (which is frozen). The
 * figures in the retention table are asserted against the code by
 * tests/unit/privacy-rights.test.ts, and anything that exists only as a plan
 * intention is labelled as such instead of being presented as a control.
 *
 * The page is laid out with the portal shell and deliberately requires no
 * role: the rights apply to every signed-in account, and the DPO placeholder
 * has to be readable before someone knows who to ask.
 */
definePageMeta({ layout: 'dashboard' })

useHead({ title: 'Privacy & your rights — USC Attendance' })

const CONTACT_PATH = '/contact'
const EXPORT_PATH = '/account/privacy#download'
const CORRECTION_PATH = '/account/privacy#correction'
const NOTICE_PATH = '/privacy'
const NPC_URL = 'https://www.privacy.gov.ph/'
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="space-y-2">
      <p class="text-xs font-mono uppercase tracking-widest text-gold-dark">
        Privacy
      </p>
      <h1 class="font-serif text-2xl font-bold text-navy md:text-3xl">
        Privacy &amp; your rights
      </h1>
      <p class="text-sm leading-relaxed text-slate">
        What the USC officer portal records about you, why it holds it, how long it keeps it, who can
        see it, and how to use your rights — in plain language.
      </p>
    </header>

    <Card>
      <CardContent class="space-y-3 p-4 md:p-6">
        <h2 class="font-bold text-navy">
          In short
        </h2>
        <ul class="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate">
          <li>
            The portal records what the council needs to run attendance, fines and clearance. It is
            not used for advertising and it is not sold.
          </li>
          <li>
            Two things are deleted automatically today: signature images and manual check-in ID
            photos. Their exact periods are in
            <a href="#retention-heading" class="font-semibold text-navy underline">
              section 3
            </a>.
          </li>
          <li>
            Most other records have <strong class="text-ink">no automatic deletion schedule yet</strong>.
            The council still has to adopt one (question C-3), and this page says so rather than
            guessing.
          </li>
          <li>
            You can download your own copy and ask for a correction from
            <NuxtLink :to="EXPORT_PATH" class="font-semibold text-navy underline">
              My data &amp; privacy
            </NuxtLink>.
          </li>
        </ul>
      </CardContent>
    </Card>

    <section aria-labelledby="recorded-heading" class="space-y-3">
      <h2 id="recorded-heading" class="font-serif text-xl font-bold text-navy">
        1. What the system records
      </h2>
      <p class="text-sm leading-relaxed text-slate">
        These are the categories the portal stores. The list is written from the database schema and
        the routes that write to it, not from a wish list.
      </p>

      <Card>
        <CardContent class="space-y-4 p-4 md:p-6">
          <div>
            <h3 class="font-bold text-navy">
              Your account and student profile
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-slate">
              Your name, school email address, role, the date the account was created, and the
              consent record described below. The student profile holds your student number,
              program and college, year level, section and — if you provided one — a contact
              number. Your password is handled by the sign-in provider and is never stored by this
              application.
            </p>
          </div>

          <div>
            <h3 class="font-bold text-navy">
              Attendance and signatures
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-slate">
              For every event or duty: the date and time, whether you checked in and out, the method
              used (your own phone, an officer's scan, a barcode or a manual entry), the officer who
              recorded it, and the signature image you draw where a signature is required. The
              signature image is kept in private storage; the attendance row keeps only a reference
              and a hash.
            </p>
          </div>

          <div>
            <h3 class="font-bold text-navy">
              Manual check-in evidence
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-slate">
              When an officer records a manual check-in, the portal stores the reason. It may also
              store one photo of your student ID as evidence. That photo lives in private storage
              that is kept separate from the public event-photo bucket, and it is never given a
              public address.
            </p>
          </div>

          <div>
            <h3 class="font-bold text-navy">
              Location
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-slate">
              The latitude, longitude and reported GPS accuracy of the device that recorded the
              check-in — an officer's phone at a scan, or your own phone for a self check-in. This is
              used to decide whether the check-in happened at the venue.
            </p>
          </div>

          <div>
            <h3 class="font-bold text-navy">
              Fines, payments, clearances and excuses
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-slate">
              Fine amounts and statuses, payment references, waivers, clearance issue and revocation
              dates, and the reason you give when filing an excuse. These are records of events, so
              they are not rewritten from the correction form.
            </p>
          </div>

          <div>
            <h3 class="font-bold text-navy">
              Requests, notices and audit records
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-slate">
              Correction requests you file (including the proposed value and the staff decision),
              notifications sent to you, and audit rows that record who read or changed a sensitive
              record and when. Audit rows are append-only in the application code.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>

    <section aria-labelledby="purpose-heading" class="space-y-3">
      <h2 id="purpose-heading" class="font-serif text-xl font-bold text-navy">
        2. Why it is recorded
      </h2>
      <ul class="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate">
        <li>
          To record attendance and duty at council events, and to let an officer verify that a
          check-in happened at the venue.
        </li>
        <li>
          To issue and settle fines, and to issue clearance based on what is actually recorded.
        </li>
        <li>
          To send the notifications that belong to those records — verification, password reset, a
          fine notice, a clearance.
        </li>
        <li>
          To keep an accountable record of who accessed or changed sensitive data, which is what
          makes an audit possible.
        </li>
        <li>
          The plan also allows optional publication (your name in minutes, resolutions or the
          transparency board) and optional messaging beyond the essential notices. Those are meant
          to be separate consents; the portal does not ask for them separately yet, so treat that
          as a plan intention, not a switch you can use today.
        </li>
      </ul>
    </section>

    <section aria-labelledby="retention-heading" class="space-y-3">
      <h2 id="retention-heading" class="font-serif text-xl font-bold text-navy">
        3. How long it is kept
      </h2>
      <p class="text-sm leading-relaxed text-slate">
        These are the periods the code uses today. Where a period is still only a plan, the row says
        so. The council can change the signature and photo settings within the ranges shown; the
        page is checked against those settings by a unit test.
      </p>

      <Card>
        <CardContent class="p-4 md:p-6">
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-left text-sm">
              <caption class="sr-only">
                Retention periods used by the USC officer portal
              </caption>
              <thead>
                <tr class="border-b border-line">
                  <th scope="col" class="py-2 pr-4 font-bold text-navy">
                    Record
                  </th>
                  <th scope="col" class="py-2 font-bold text-navy">
                    How long
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr data-retention-row="signature" class="border-b border-line/70 align-top">
                  <th scope="row" class="py-3 pr-4 font-semibold text-ink">
                    Signature image
                  </th>
                  <td class="py-3 leading-relaxed text-slate">
                    <span data-retention-value="signature-semesters">1 semester</span> after the
                    semester you signed it in (that semester counts as the first), plus a grace
                    period of
                    <span data-retention-value="signature-grace-days">30 days</span>.
                    The council may set
                    <span data-retention-bound="signature-semesters">1 to 8 semesters</span> and a
                    grace period of
                    <span data-retention-bound="signature-grace-days">0 to 365 days</span>.
                    The daily purge deletes the image bytes; the attendance row, its time and its
                    hash remain.
                  </td>
                </tr>

                <tr data-retention-row="photo" class="border-b border-line/70 align-top">
                  <th scope="row" class="py-3 pr-4 font-semibold text-ink">
                    Manual check-in ID photo
                  </th>
                  <td class="py-3 leading-relaxed text-slate">
                    <span data-retention-value="photo-days">90 days</span> after capture. The
                    deployment setting accepts
                    <span data-retention-bound="photo-days">1 to 3650 days</span>. The daily purge
                    deletes the object first, then clears the three photo columns; the attendance
                    record itself stays.
                  </td>
                </tr>

                <tr data-retention-row="location" data-retention-state="planned" class="border-b border-line/70 align-top">
                  <th scope="row" class="py-3 pr-4 font-semibold text-ink">
                    Raw location coordinates
                  </th>
                  <td class="py-3 leading-relaxed text-slate">
                    <p data-retention-plan="location">
                      <Badge variant="warning">
                        Plan only
                      </Badge>
                      <span class="mt-2 block">
                        No automatic deletion today. The plan is to drop the raw coordinates once a
                        dispute window closes and keep only the proof that the check-in was inside
                        the venue, but no job does that yet and the council has not chosen the
                        window (question C-6).
                      </span>
                    </p>
                  </td>
                </tr>

                <tr data-retention-row="records" data-retention-state="planned" class="border-b border-line/70 align-top">
                  <th scope="row" class="py-3 pr-4 font-semibold text-ink">
                    Attendance, fines, payments, clearances and excuses
                  </th>
                  <td class="py-3 leading-relaxed text-slate">
                    <p data-retention-plan="records">
                      <Badge variant="warning">
                        Not fixed yet
                      </Badge>
                      <span class="mt-2 block">
                        No automatic deletion today. The council has not adopted the university
                        records schedule, so these records are kept while that question is open
                        (question C-3). Saying otherwise here would be an invented retention
                        period.
                      </span>
                    </p>
                  </td>
                </tr>

                <tr data-retention-row="account" data-retention-state="planned" class="align-top">
                  <th scope="row" class="py-3 pr-4 font-semibold text-ink">
                    Account, profile, consent record
                  </th>
                  <td class="py-3 leading-relaxed text-slate">
                    <p data-retention-plan="account">
                      <Badge variant="warning">
                        Not fixed yet
                      </Badge>
                      <span class="mt-2 block">
                        Kept while the account exists. There is no automatic deletion or
                        anonymisation for a graduate or a leaver yet; the plan calls for a graduate
                        workflow, but it is not built. Closing an account is handled by the council
                        office, not by a button on this page.
                      </span>
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="mt-4 text-xs leading-relaxed text-slate">
            Notifications, correction requests and audit rows are kept with the same "no automatic
            deletion yet" status. The plan suggests a short life for delivery rows (roughly a year),
            but there is no purge job behind that suggestion today.
          </p>
        </CardContent>
      </Card>
    </section>

    <section aria-labelledby="visibility-heading" class="space-y-3">
      <h2 id="visibility-heading" class="font-serif text-xl font-bold text-navy">
        4. Who can see it
      </h2>
      <div class="space-y-3">
        <Card>
          <CardContent class="space-y-3 p-4 md:p-6">
            <div>
              <h3 class="font-bold text-navy">
                You
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-slate">
                You can see your own profile, attendance, fines, clearances, excuse reasons and
                correction requests. The download on
                <NuxtLink :to="EXPORT_PATH" class="font-semibold text-navy underline">
                  My data &amp; privacy
                </NuxtLink>
                is generated for the signed-in account only and is never cached by a shared server.
              </p>
            </div>

            <div>
              <h3 class="font-bold text-navy">
                Council officers and staff
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-slate">
                Officers see the records their role needs: attendance and roster staff for an event,
                finance roles for fines and payments, and the adviser or super administrator for
                oversight. Every permission is checked on the server; hiding a button in the
                interface is not the control.
              </p>
            </div>

            <div>
              <h3 class="font-bold text-navy">
                ID photos
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-slate">
                Only staff — or a delegate holding roster access for that event — can open a manual
                check-in photo, and every view writes an audit row. The image is streamed through an
                authenticated route or a 60-second signed link, never a public URL.
              </p>
            </div>

            <div>
              <h3 class="font-bold text-navy">
                The public
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-slate">
                No attendance, fine or clearance record is published. A document is published only
                through an explicit, audited action. The plan allows optional consent for naming a
                student in a publication, but that separate consent is not built yet.
              </p>
            </div>

            <div>
              <h3 class="font-bold text-navy">
                What your data copy deliberately leaves out
              </h3>
              <p class="mt-1 text-sm leading-relaxed text-slate">
                The export is built field by field, so it does not include:
              </p>
              <ul data-export-exclusions class="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate">
                <li>other students — every row is checked against your account</li>
                <li>staff identifiers — recorder, issuer, reviewer and decider ids</li>
                <li>internal notes — fine, excuse and clearance review notes</li>
                <li>raw location coordinates</li>
                <li>private attachment storage keys</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <section aria-labelledby="rights-heading" class="space-y-3">
      <h2 id="rights-heading" class="font-serif text-xl font-bold text-navy">
        5. Your four rights
      </h2>
      <p class="text-sm leading-relaxed text-slate">
        Each right below links to the part of the portal that handles it. Where a right is only
        partly built, that is stated here instead of pointing you at a button that does nothing.
      </p>

      <div class="space-y-3">
        <Card>
          <CardContent class="space-y-2 p-4 md:p-6">
            <h3 class="font-bold text-navy">
              1. Access — see and copy your data
            </h3>
            <p class="text-sm leading-relaxed text-slate">
              Open
              <NuxtLink :to="EXPORT_PATH" class="font-semibold text-navy underline">
                My data &amp; privacy
              </NuxtLink>
              and choose <strong class="text-ink">Download my data (JSON)</strong>. The file contains
              your profile, consent record, attendance, fines, clearances, excuse reasons and
              correction requests. It does not contain the signature image itself; it says whether
              the image is still retained. Sign in first if you are signed out.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="space-y-2 p-4 md:p-6">
            <h3 class="font-bold text-navy">
              2. Rectification — ask for a correction
            </h3>
            <p class="text-sm leading-relaxed text-slate">
              Use the correction form on
              <NuxtLink :to="CORRECTION_PATH" class="font-semibold text-navy underline">
                My data &amp; privacy
              </NuxtLink>.
              A staff member reviews the request and records a reason for the decision, which you
              can read on the same page. The stored details you can ask to correct are
            </p>
            <ul class="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate">
              <li data-correctable-field="name">
                Full name
              </li>
              <li data-correctable-field="studentNo">
                Student number
              </li>
              <li data-correctable-field="yearLevel">
                Year level
              </li>
              <li data-correctable-field="section">
                Section
              </li>
            </ul>
            <p class="text-sm leading-relaxed text-slate">
              Attendance records, fines, payments, waivers and clearance standing are records of
              events, so they are reviewed through the
              <NuxtLink to="/fines" class="font-semibold text-navy underline">
                fines and excuse path
              </NuxtLink>
              rather than rewritten by the correction form. The form is for student accounts;
              officers should use the council office process.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="space-y-2 p-4 md:p-6">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-navy">
                3. Withdraw consent
              </h3>
              <Badge variant="warning">
                Not self-service yet
              </Badge>
            </div>
            <p class="text-sm leading-relaxed text-slate">
              The portal records one consent at registration: agreement to the privacy notice at
              version
              <span data-consent-version class="font-mono text-ink">2026-10</span>, with the date
              and source of the agreement. It does not yet have a separate switch for publication or
              messaging, and it does not have a "withdraw" button.
            </p>
            <p class="text-sm leading-relaxed text-slate">
              To withdraw consent now, send a written request to the council office through the
              <NuxtLink :to="CONTACT_PATH" class="font-semibold text-navy underline">
                contact page
              </NuxtLink>
              and mark it "data privacy request". Withdrawing the core attendance consent means the
              account cannot continue; records already created are kept under the retention rules
              above, because council records are records of events.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="space-y-2 p-4 md:p-6">
            <h3 class="font-bold text-navy">
              4. Complain
            </h3>
            <p class="text-sm leading-relaxed text-slate">
              Start with the council office through the
              <NuxtLink :to="CONTACT_PATH" class="font-semibold text-navy underline">
                contact page
              </NuxtLink>
              so the people who hold the record can answer. If the concern is not resolved, you may
              complain to the
              <a
                :href="NPC_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold text-navy underline"
              >
                National Privacy Commission
              </a>, the government body that enforces the Data Privacy Act. You do not need the
              council's permission to complain.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>

    <section aria-labelledby="dpo-heading" class="space-y-3">
      <h2 id="dpo-heading" class="font-serif text-xl font-bold text-navy">
        Who to ask about privacy
      </h2>

      <div
        id="dpo-contact"
        data-dpo-placeholder
        class="rounded-xl border-2 border-dashed border-gold-500/70 bg-gold-50 p-4 md:p-6"
      >
        <p class="text-xs font-mono uppercase tracking-widest text-gold-800">
          Placeholder — council decision C-4 is unanswered
        </p>
        <h3 class="mt-2 font-bold text-navy">
          Data Protection Officer contact: not yet published
        </h3>
        <p class="mt-2 text-sm leading-relaxed text-slate">
          The council has not yet decided whether it or the university is the data controller, or
          who will sign as the Data Protection Officer. This space is deliberately empty: no name,
          email address or phone number appears here until the council records a real one. An
          invented contact would send a privacy request to someone who cannot act on it.
        </p>
        <p class="mt-2 text-sm leading-relaxed text-slate">
          Until then, send privacy requests through the
          <NuxtLink :to="CONTACT_PATH" class="font-semibold text-navy underline">
            council contact page
          </NuxtLink>
          and mark them "data privacy request". The answer to C-4 will be recorded in the council's
          decision register and this placeholder will be replaced with the official contact.
        </p>
      </div>
    </section>

    <section aria-labelledby="planned-heading" class="space-y-3">
      <h2 id="planned-heading" class="font-serif text-xl font-bold text-navy">
        What this page cannot promise yet
      </h2>
      <ul class="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate">
        <li>
          <strong class="text-ink">Separate publication and messaging consents.</strong> The plan
          asks for three purposes; the portal records one consent today.
        </li>
        <li>
          <strong class="text-ink">A guardian path for students under 18.</strong> It is in the plan,
          not in the registration flow.
        </li>
        <li>
          <strong class="text-ink">Automatic deletion of raw coordinates.</strong> Planned after a
          dispute window; no job exists and the window is undecided (C-6).
        </li>
        <li>
          <strong class="text-ink">A records retention schedule.</strong> Attendance, fines,
          payments, clearances and excuses have no automatic deletion until the council adopts one
          (C-3).
        </li>
        <li>
          <strong class="text-ink">Graduate anonymisation and self-service account closure.</strong>
          Both are plan intentions; the council office handles closure manually today.
        </li>
      </ul>
    </section>

    <footer class="border-t border-line pt-4 text-xs leading-relaxed text-slate">
      <p>
        This page describes the code as it stands on 21 October 2026. A unit test in the repository
        checks that every retention figure above matches the constant or setting the code uses. It is
        a plain-language description, not legal advice, and it does not replace the
        <NuxtLink :to="NOTICE_PATH" class="font-semibold text-navy underline">
          public privacy notice
        </NuxtLink>.
      </p>
    </footer>
  </div>
</template>
