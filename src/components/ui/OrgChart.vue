<script setup lang="ts">
import type { Officer, OfficerTier } from '@/data/officers'
import { computed } from 'vue'
import OfficerCard from './OfficerCard.vue'

const props = defineProps<{
  officers: Officer[]
}>()

// ── Group officers by tier ──
function byTier(tier: OfficerTier) {
  return computed(() => props.officers.filter(o => o.tier === tier))
}

const administration = byTier('administration')
const federatedUsc = byTier('federated_usc')
const uscAdvisers = byTier('usc_advisers')
const uscExecutive = byTier('usc_executive')
const studentSenate = byTier('student_senate')

// ── Administration subgroups ──
const universityPresident = computed(() => administration.value.find(o => o.position === 'University President'))
const vicePresidentAA = computed(() => administration.value.find(o => o.position === 'Vice President for Academic Affairs'))
const campusAdmin = computed(() => administration.value.find(o => o.position === 'Campus Administrator'))
const sscChairperson = computed(() => administration.value.find(o => o.position.includes('OIC Chairperson')))
const adminSupport = computed(() => administration.value.filter(o =>
  o.position.includes('Administrative Support') || o.position.includes('Coordinator') || o.position.includes('Psychometrician')
))

// ── USC Executive subgroups ──
const uscPresident = computed(() => uscExecutive.value.find(o => o.position === 'President'))
const uscVicePresident = computed(() => uscExecutive.value.find(o => o.position === 'Vice President'))
const uscSecretary = computed(() => uscExecutive.value.find(o => o.position === 'Secretary'))
const uscAuditor = computed(() => uscExecutive.value.find(o => o.position === 'Auditor'))
const uscTreasurer = computed(() => uscExecutive.value.find(o => o.position === 'Treasurer'))
const uscSpokesperson = computed(() => uscExecutive.value.find(o => o.position === 'Spokesperson'))
const uscSenatePresident = computed(() => uscExecutive.value.find(o => o.position === 'Senate President'))

// ── Initials helpers ──
function getInitials(name?: string) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(p => !p.endsWith('.'))
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getShortTitle(position: string) {
  if (position.includes('University President')) return 'Univ. Pres.'
  if (position.includes('Vice President for Academic')) return 'VP Academic'
  if (position.includes('Campus Administrator')) return 'Campus Admin'
  if (position.includes('OIC Chairperson')) return 'SSC Chair'
  if (position.includes('Federated') && position.includes('Adviser')) return 'FUSC Adviser'
  if (position.includes('Federated') && position.includes('President')) return 'FUSC Pres.'
  if (position.includes('Adviser, University')) return 'USC Adviser'
  if (position.includes('Co-Adviser, University')) return 'USC Co-Adv.'
  if (position.includes('Senate President')) return 'Senate Pres.'
  return position
}
</script>

<template>
  <div class="org-chart-wrapper">
    <div class="org-chart-inner">

      <!-- ══════════════════════════════════════════════════
           TIER 1: UNIVERSITY ADMINISTRATION
           ══════════════════════════════════════════════════ -->

      <!-- Tier 1a: University President -->
      <div class="tier-label">
        <span>University Administration</span>
      </div>

      <div class="tier-row" v-if="universityPresident">
        <OfficerCard
          :name="universityPresident.name"
          designation="University President"
          :initials="getInitials(universityPresident.name)"
          variant="institutional"
        />
      </div>

      <!-- Connector: 1 → 2 (branch down) -->
      <div class="connector">
        <div class="conn-line" style="top: 0; left: 50%; height: 50%"></div>
        <div class="conn-bar" style="top: 50%; left: 25%; width: 50%"></div>
        <div class="conn-line" style="top: 50%; left: 25%; height: 50%"></div>
        <div class="conn-line" style="top: 50%; left: 75%; height: 50%"></div>
      </div>

      <!-- Tier 1b: VP Academic + Campus Administrator (2-up) -->
      <div class="tier-row two-up">
        <OfficerCard
          v-if="vicePresidentAA"
          :name="vicePresidentAA.name"
          designation="VP Academic Affairs"
          :initials="getInitials(vicePresidentAA.name)"
          variant="institutional"
        />
        <OfficerCard
          v-if="campusAdmin"
          :name="campusAdmin.name"
          designation="Campus Administrator"
          :initials="getInitials(campusAdmin.name)"
          variant="pivot"
        />
      </div>

      <!-- Connector: 2 → 1 (merge down to SSC Chair) -->
      <div class="connector">
        <div class="conn-line" style="top: 0; left: 25%; height: 50%"></div>
        <div class="conn-line" style="top: 0; left: 75%; height: 50%"></div>
        <div class="conn-bar" style="top: 50%; left: 25%; width: 50%"></div>
        <div class="conn-line" style="top: 50%; left: 50%; height: 50%"></div>
      </div>

      <!-- Tier 1c: SSC Chairperson -->
      <div class="tier-row" v-if="sscChairperson">
        <OfficerCard
          :name="sscChairperson.name"
          designation="OIC Chairperson, SSC"
          :initials="getInitials(sscChairperson.name)"
          variant="institutional"
        />
      </div>

      <!-- Connector: down to coordinators -->
      <div class="connector">
        <div class="conn-line" style="top: 0; left: 50%; height: 100%"></div>
      </div>

      <!-- Tier 1d: Coordinators row -->
      <div class="coordinators-row">
        <div
          v-for="coord in adminSupport"
          :key="coord.name"
          class="coordinator-node"
        >
          <OfficerCard
            :name="coord.name"
            :designation="getShortTitle(coord.position)"
            :initials="getInitials(coord.name)"
            variant="institutional"
          />
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════
           TIER 2: FEDERATED USC
           ══════════════════════════════════════════════════ -->

      <div class="tier-label">
        <span>Federated University Student Council</span>
      </div>

      <!-- Connector from admin down to federated -->
      <div class="connector">
        <div class="conn-line" style="top: 0; left: 50%; height: 50%"></div>
        <div class="conn-bar" style="top: 50%; left: 25%; width: 50%"></div>
        <div class="conn-line" style="top: 50%; left: 25%; height: 50%"></div>
        <div class="conn-line" style="top: 50%; left: 75%; height: 50%"></div>
      </div>

      <div class="tier-row two-up">
        <div v-for="officer in federatedUsc" :key="officer.name">
          <OfficerCard
            :name="officer.name"
            :designation="getShortTitle(officer.position)"
            :initials="getInitials(officer.name)"
            :variant="officer.position.includes('Adviser') ? 'institutional' : 'pivot'"
          />
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════
           TIER 3: USC ADVISERS
           ══════════════════════════════════════════════════ -->

      <div class="tier-label">
        <span>USC Advisers</span>
      </div>

      <div class="connector">
        <div class="conn-line" style="top: 0; left: 50%; height: 100%"></div>
      </div>

      <div class="tier-row two-up">
        <div v-for="officer in uscAdvisers" :key="officer.name">
          <OfficerCard
            :name="officer.name"
            :designation="getShortTitle(officer.position)"
            :initials="getInitials(officer.name)"
            variant="institutional"
          />
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════
           TIER 4: USC EXECUTIVE OFFICERS
           ══════════════════════════════════════════════════ -->

      <div class="tier-label">
        <span>USC Executive Officers</span>
      </div>

      <div class="connector">
        <div class="conn-line" style="top: 0; left: 50%; height: 100%"></div>
      </div>

      <!-- Executive tree grid -->
      <div class="exec-grid">
        <!-- Row 1: President -->
        <div class="exec-pres">
          <OfficerCard
            v-if="uscPresident"
            :name="uscPresident.name"
            designation="USC President"
            :email="uscPresident.email"
            :initials="getInitials(uscPresident.name)"
            variant="executive"
          />
        </div>

        <!-- Row 2: Connector down to VP -->
        <div class="exec-conn-vp connector">
          <div class="conn-line" style="top: 0; left: 50%; height: 100%"></div>
        </div>

        <!-- Row 3: Vice President -->
        <div class="exec-vp">
          <OfficerCard
            v-if="uscVicePresident"
            :name="uscVicePresident.name"
            designation="USC Vice President"
            :email="uscVicePresident.email"
            :initials="getInitials(uscVicePresident.name)"
            variant="executive"
          />
        </div>

        <!-- Row 4: Branch connector (1 → 4) -->
        <div class="exec-branch connector">
          <div class="conn-line" style="top: 0; left: 50%; height: 50%"></div>
          <div class="conn-bar" style="top: 50%; left: 12.5%; width: 75%"></div>
          <div class="conn-line" style="top: 50%; left: 12.5%; height: 50%"></div>
          <div class="conn-line" style="top: 50%; left: 37.5%; height: 50%"></div>
          <div class="conn-line" style="top: 50%; left: 62.5%; height: 50%"></div>
          <div class="conn-line" style="top: 50%; left: 87.5%; height: 50%"></div>
        </div>

        <!-- Row 5: 4 officer cards -->
        <div class="exec-officers">
          <div v-if="uscSecretary" class="exec-officer-cell">
            <OfficerCard
              :name="uscSecretary.name"
              designation="Secretary"
              :email="uscSecretary.email"
              :initials="getInitials(uscSecretary.name)"
              variant="committee"
            />
          </div>
          <div v-if="uscSenatePresident" class="exec-officer-cell">
            <OfficerCard
              :name="uscSenatePresident.name"
              designation="Senate President"
              :email="uscSenatePresident.email"
              :initials="getInitials(uscSenatePresident.name)"
              variant="committee"
            />
          </div>
          <div v-if="uscAuditor" class="exec-officer-cell">
            <OfficerCard
              :name="uscAuditor.name"
              designation="Auditor"
              :email="uscAuditor.email"
              :initials="getInitials(uscAuditor.name)"
              variant="committee"
            />
          </div>
          <div v-if="uscTreasurer" class="exec-officer-cell">
            <OfficerCard
              :name="uscTreasurer.name"
              designation="Treasurer"
              :email="uscTreasurer.email"
              :initials="getInitials(uscTreasurer.name)"
              variant="committee"
            />
          </div>
        </div>

        <!-- Row 6: Spokesperson (centered below) -->
        <div class="exec-spokes connector">
          <div class="conn-line" style="top: 0; left: 50%; height: 50%"></div>
          <div class="conn-bar" style="top: 50%; left: 37.5%; width: 25%"></div>
          <div class="conn-line" style="top: 50%; left: 50%; height: 50%"></div>
        </div>

        <div class="exec-spokesperson">
          <OfficerCard
            v-if="uscSpokesperson"
            :name="uscSpokesperson.name"
            designation="Spokesperson"
            :email="uscSpokesperson.email"
            :initials="getInitials(uscSpokesperson.name)"
            variant="committee"
          />
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════
           TIER 5: STUDENT SENATE
           ══════════════════════════════════════════════════ -->

      <div class="tier-label senate-tier-label">
        <div class="conn-line" style="top: -30px; bottom: 0; left: 50%; height: calc(100% + 30px); z-index: 1"></div>
        <span>Student Senate</span>
      </div>

      <div class="senators-row-container">
        <div class="senators-row">
          <div
            v-for="senator in studentSenate"
            :key="senator.name"
            class="senator-node-container"
          >
            <OfficerCard
              :name="senator.name"
              designation="Senator"
              :initials="getInitials(senator.name)"
              variant="senate"
            />
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   WRAPPER & CANVAS
   ══════════════════════════════════════════ */
.org-chart-wrapper {
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 3rem;
  width: 100%;
  background: linear-gradient(160deg, #0a1628 0%, #0d1b2a 60%, #0e1f30 100%);
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 2.5rem 1.5rem;
  box-shadow:
    0 0 0 1px rgba(201, 162, 75, 0.08),
    0 32px 80px -16px rgba(0, 0, 0, 0.6);
  position: relative;
}

.org-chart-wrapper::before {
  content: '';
  position: absolute;
  top: -80px;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 300px;
  background: radial-gradient(ellipse, rgba(201, 162, 75, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.org-chart-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

/* ══════════════════════════════════════════
   TIER ROWS
   ══════════════════════════════════════════ */
.tier-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4rem;
  padding: 0.75rem 0;
}

.tier-row.two-up {
  gap: 4rem;
}

/* ══════════════════════════════════════════
   COORDINATORS ROW
   ══════════════════════════════════════════ */
.coordinators-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  width: 100%;
}

.coordinator-node {
  flex: 0 1 auto;
}

/* ══════════════════════════════════════════
   CONNECTORS
   ══════════════════════════════════════════ */
.connector {
  position: relative;
  height: 40px;
  width: 100%;
  flex-shrink: 0;
}

.conn-line {
  position: absolute;
  width: 1px;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.2);
}

.conn-bar {
  position: absolute;
  height: 1px;
  background: linear-gradient(to right, rgba(201, 162, 75, 0.25), rgba(201, 162, 75, 0.6), rgba(201, 162, 75, 0.25));
  transform: translateY(-50%);
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

/* ══════════════════════════════════════════
   TIER LABELS
   ══════════════════════════════════════════ */
.tier-label {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2.25rem 0 1.5rem;
  position: relative;
  white-space: nowrap;
}

.tier-label::before,
.tier-label::after {
  content: '';
  flex: 1;
  height: 1px;
  max-width: 200px;
  background: linear-gradient(to right, transparent, rgba(201, 162, 75, 0.3));
}

.tier-label::after {
  background: linear-gradient(to left, transparent, rgba(201, 162, 75, 0.3));
}

.tier-label span {
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(201, 162, 75, 0.55);
  font-weight: 700;
  padding: 0.3rem 0.8rem;
  border: 1px solid rgba(201, 162, 75, 0.2);
  border-radius: 999px;
  background: rgba(201, 162, 75, 0.06);
}

.senate-tier-label {
  position: relative;
  width: 100%;
  overflow: visible;
}

.senate-tier-label span {
  position: relative;
  z-index: 10;
  background: rgba(20, 60, 55, 0.25);
  border-color: rgba(45, 188, 168, 0.25);
  color: rgba(80, 220, 200, 0.7);
}

/* ══════════════════════════════════════════
   EXECUTIVE GRID
   ══════════════════════════════════════════ */
.exec-grid {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 0;
}

.exec-pres,
.exec-vp,
.exec-spokesperson {
  display: flex;
  justify-content: center;
  padding: 0.25rem 0;
}

.exec-conn-vp,
.exec-branch,
.exec-spokes {
  width: 100%;
}

.exec-officers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  width: 100%;
  gap: 1rem;
  padding: 0.5rem 0;
}

.exec-officer-cell {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   SENATORS ROW
   ══════════════════════════════════════════ */
.senators-row-container {
  width: 100%;
  display: flex;
  justify-content: center;
}

.senators-row {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  width: 100%;
  gap: 0.5rem;
}

.senator-node-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 5px 10px;
  flex: 1;
  min-width: 190px;
}

.senator-node-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to right, rgba(45, 188, 168, 0.15), rgba(45, 188, 168, 0.5), rgba(45, 188, 168, 0.15));
}

.senator-node-container:first-child::before { left: 50%; }
.senator-node-container:last-child::before  { right: 50%; }

.senator-node-container::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  height: 24px;
  width: 1px;
  background: rgba(45, 188, 168, 0.4);
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(45, 188, 168, 0.2);
}

/* ══════════════════════════════════════════
   MOBILE
   ══════════════════════════════════════════ */
@media (max-width: 768px) {
  .tier-row {
    gap: 1rem;
    padding: 0.375rem 0;
  }

  .tier-row.two-up { gap: 0.75rem; }

  .connector { height: 20px; }

  .exec-officers {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .coordinators-row {
    gap: 0.5rem;
  }

  .senators-row {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .senator-node-container {
    padding: 14px 4px 6px;
    min-width: 0;
    flex: 0 1 auto;
    width: calc(33.33% - 0.5rem);
    max-width: 110px;
  }

  .senator-node-container::after { height: 14px; }
}
</style>
