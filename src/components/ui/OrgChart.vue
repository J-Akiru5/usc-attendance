<script setup lang="ts">
import type { Officer, OversightNode } from '@/data/officers'
import { computed } from 'vue'
import OfficerCard from './OfficerCard.vue'

const props = defineProps<{
  oversight: OversightNode[]
  officers: Officer[]
}>()

const president = computed(() => props.officers.find(o => o.position === 'President'))
const vicePresident = computed(() => props.officers.find(o => o.position === 'Vice President'))
const senatePresident = computed(() => props.officers.find(o => o.position === 'Senate President'))
const senators = computed(() => props.officers.filter(o => o.role === 'senate'))
const secretary = computed(() => props.officers.find(o => o.position === 'Secretary'))
const auditor = computed(() => props.officers.find(o => o.position === 'Auditor'))
const treasurer = computed(() => props.officers.find(o => o.position === 'Treasurer'))
const spokesperson = computed(() => props.officers.find(o => o.position === 'Spokesperson'))

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

function getPositionInitials(title: string) {
  if (title === 'Name to confirm') return '?'
  const mappings: Record<string, string> = {
    'SUC President': 'SP',
    'FUSC Adviser': 'FA',
    'FUSC President': 'FP',
    'Campus AD': 'AD',
    'SSC Chair': 'SC',
    'Vice Chair': 'VC',
    'USC Adviser': 'UA',
    'USC Co-Adviser': 'CA',
    'Senate President': 'SP'
  }
  return mappings[title] || title.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="org-chart-wrapper">
    <div class="org-chart-inner">

      <!-- ====== OVERSIGHT SECTION ====== -->

      <!-- Tier 1: SUC President -->
      <div class="tier-row">
        <OfficerCard
          name="SUC President"
          designation="Institutional Oversight"
          :initials="getPositionInitials('SUC President')"
          variant="institutional"
        />
      </div>

      <!-- Connector: branch-down 1→2 -->
      <div class="connector" style="--tl: 50%; --bl: 25%,75%; --bar-l: 25%; --bar-w: 50%">
        <div class="conn-line" style="top:0; left:var(--tl); height:50%"></div>
        <div class="conn-bar" style="top:50%; left:var(--bar-l); width:var(--bar-w)"></div>
        <div class="conn-line" style="top:50%; left:25%; height:50%"></div>
        <div class="conn-line" style="top:50%; left:75%; height:50%"></div>
      </div>

      <!-- Tier 2: FUSC Adviser + Placeholder -->
      <div class="tier-row two-up">
        <OfficerCard
          name="FUSC Adviser"
          designation="Institutional Oversight"
          :initials="getPositionInitials('FUSC Adviser')"
          variant="institutional"
        />
        <OfficerCard
          designation="Institutional Oversight"
          initials="?"
          variant="institutional"
          :flagged="true"
        />
      </div>

      <!-- Connector: branch-merge 2→1 -->
      <div class="connector" style="--tl: 25%,75%; --bl: 50%; --bar-l: 25%; --bar-w: 50%">
        <div class="conn-line" style="top:0; left:25%; height:50%"></div>
        <div class="conn-line" style="top:0; left:75%; height:50%"></div>
        <div class="conn-bar" style="top:50%; left:var(--bar-l); width:var(--bar-w)"></div>
        <div class="conn-line" style="top:50%; left:var(--bl); height:50%"></div>
      </div>

      <!-- Tier 3: FUSC President -->
      <div class="tier-row">
        <OfficerCard
          name="FUSC President"
          designation="Institutional Oversight"
          :initials="getPositionInitials('FUSC President')"
          variant="institutional"
        />
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 4: Campus AD -->
      <div class="tier-row">
        <OfficerCard
          name="Campus AD"
          designation="Institutional Oversight"
          :initials="getPositionInitials('Campus AD')"
          variant="pivot"
        />
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 5: SSC Chair -->
      <div class="tier-row">
        <OfficerCard
          name="SSC Chair"
          designation="Institutional Oversight"
          :initials="getPositionInitials('SSC Chair')"
          variant="institutional"
        />
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6: Vice Chair -->
      <div class="tier-row">
        <OfficerCard
          name="Vice Chair"
          designation="Institutional Oversight"
          :initials="getPositionInitials('Vice Chair')"
          variant="pivot"
        />
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6b: USC Adviser -->
      <div class="tier-row">
        <OfficerCard
          name="USC Adviser"
          designation="Institutional Oversight"
          :initials="getPositionInitials('USC Adviser')"
          variant="institutional"
        />
      </div>

      <!-- Connector: line-single -->
      <div class="connector">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- Tier 6c: USC Co-Adviser -->
      <div class="tier-row">
        <OfficerCard
          name="USC Co-Adviser"
          designation="Institutional Oversight"
          :initials="getPositionInitials('USC Co-Adviser')"
          variant="institutional"
        />
      </div>

      <!-- ====== TIER LABEL ====== -->
      <div class="tier-label">
        <span>USC Executive Officers</span>
      </div>

      <!-- ====== EXECUTIVE SECTION ====== -->
      <div class="exec-grid">
        <!-- Row 1: President -->
        <div class="pres-node-wrap flex justify-center pb-2">
          <OfficerCard
            v-if="president"
            :name="president.name"
            :designation="president.position"
            :email="president.email"
            :initials="getInitials(president.name)"
            variant="executive"
          />
        </div>

        <!-- Row 2: Connector down to VP -->
        <div class="conn-to-vp connector">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>

        <!-- Row 3: Vice President -->
        <div class="vp-node-wrap flex justify-center pb-2">
          <OfficerCard
            v-if="vicePresident"
            :name="vicePresident.name"
            :designation="vicePresident.position"
            :email="vicePresident.email"
            :initials="getInitials(vicePresident.name)"
            variant="executive"
          />
        </div>

        <!-- Desktop 1-to-5 Branch-down Connector (Desktop only) -->
        <div class="desk-conn-branch connector">
          <div class="conn-line" style="top:0; left:50%; height:50%"></div>
          <div class="conn-bar" style="top:50%; left:10%; width:80%"></div>
          <div class="conn-line" style="top:50%; left:10%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:30%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:50%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:70%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:90%; height:50%"></div>
        </div>

        <!-- Mobile Connector: VP to Senate Pres (Mobile only) -->
        <div class="mob-conn-to-sp connector">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>

        <!-- Senate President Card (Elevated on mobile) -->
        <div class="sp-node-wrap flex justify-center">
          <OfficerCard
            v-if="senatePresident"
            :name="senatePresident.name"
            :designation="senatePresident.position"
            :email="senatePresident.email"
            :initials="getInitials(senatePresident.name)"
            variant="committee"
          />
        </div>

        <!-- Mobile 1-to-4 Branch-down Connector (Mobile only) -->
        <div class="mob-conn-branch-from-sp connector">
          <div class="conn-line" style="top:0; left:50%; height:50%"></div>
          <div class="conn-bar" style="top:50%; left:12.5%; width:75%"></div>
          <div class="conn-line" style="top:50%; left:12.5%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:37.5%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:62.5%; height:50%"></div>
          <div class="conn-line" style="top:50%; left:87.5%; height:50%"></div>
        </div>

        <!-- Secretary Card -->
        <div class="sec-node-wrap flex justify-center" v-if="secretary">
          <OfficerCard
            :name="secretary.name"
            :designation="secretary.position"
            :email="secretary.email"
            :initials="getInitials(secretary.name)"
            variant="committee"
          />
        </div>

        <!-- Auditor Card -->
        <div class="aud-node-wrap flex justify-center" v-if="auditor">
          <OfficerCard
            :name="auditor.name"
            :designation="auditor.position"
            :email="auditor.email"
            :initials="getInitials(auditor.name)"
            variant="committee"
          />
        </div>

        <!-- Treasurer Card -->
        <div class="tre-node-wrap flex justify-center" v-if="treasurer">
          <OfficerCard
            :name="treasurer.name"
            :designation="treasurer.position"
            :email="treasurer.email"
            :initials="getInitials(treasurer.name)"
            variant="committee"
          />
        </div>

        <!-- Spokesperson Card -->
        <div class="spo-node-wrap flex justify-center" v-if="spokesperson">
          <OfficerCard
            :name="spokesperson.name"
            :designation="spokesperson.position"
            :email="spokesperson.email"
            :initials="getInitials(spokesperson.name)"
            variant="committee"
          />
        </div>

        <!-- Desktop Connector below Senate President (col 3) -->
        <div class="conn-to-senate-desk connector">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>

        <!-- Mobile Connector below the 4 cards -->
        <div class="conn-to-senate-mob connector">
          <div class="conn-line" style="top:0; left:50%; height:100%"></div>
        </div>
      </div>

      <!-- Connector line from Senate President down to Senate Label -->
      <div class="connector-to-senate">
        <div class="conn-line" style="top:0; left:50%; height:100%"></div>
      </div>

      <!-- ====== TIER LABEL WITH PASS-THROUGH CONNECTOR ====== -->
      <div class="tier-label senate-tier-label">
        <div class="conn-line" style="top:-30px; bottom:0; left:50%; height:calc(100% + 30px); z-index: 1;"></div>
        <span>Legislative Body &mdash; Student Senate</span>
      </div>

      <!-- ====== SENATORS SECTION ====== -->
      <div class="senators-row-container">
        <div class="senators-row">
          <div
            v-for="senator in senators"
            :key="senator.email ?? senator.position"
            class="senator-node-container"
          >
            <OfficerCard
              :name="senator.name"
              :designation="senator.position"
              :email="senator.email"
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

/* Subtle ambient glow blobs */
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
  min-width: auto; /* auto adjusts to screen/parent container width */
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
   EXECUTIVE GRID
   ══════════════════════════════════════════ */
.exec-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  width: 100%;
  gap: 0;
}

.pres-node-wrap { grid-column: 1 / 6; grid-row: 1; }
.conn-to-vp { grid-column: 1 / 6; grid-row: 2; }
.vp-node-wrap { grid-column: 1 / 6; grid-row: 3; }
.desk-conn-branch { grid-column: 1 / 6; grid-row: 4; display: block; }

.mob-conn-to-sp { display: none; }
.mob-conn-branch-from-sp { display: none; }
.conn-to-senate-mob { display: none; }

.sec-node-wrap { grid-column: 1; grid-row: 5; }
.aud-node-wrap { grid-column: 2; grid-row: 5; }
.sp-node-wrap { grid-column: 3; grid-row: 5; }
.tre-node-wrap { grid-column: 4; grid-row: 5; }
.spo-node-wrap { grid-column: 5; grid-row: 5; }

.conn-to-senate-desk { grid-column: 3; grid-row: 6; display: block; }

.connector {
  position: relative;
  height: 40px;
  width: 100%;
  flex-shrink: 0;
}

.connector-to-senate {
  position: relative;
  height: 30px;
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

/* Horizontal bus line */
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

/* Vertical drop line */
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
   MOBILE — fits everything into viewport
══════════════════════════════════════════ */
@media (max-width: 768px) {
  .org-chart-inner {
    min-width: auto; /* reset desktop min-width */
  }

  .exec-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .pres-node-wrap { grid-column: 1 / 5; grid-row: 1; }
  .conn-to-vp { grid-column: 1 / 5; grid-row: 2; }
  .vp-node-wrap { grid-column: 1 / 5; grid-row: 3; }
  
  .mob-conn-to-sp { grid-column: 1 / 5; grid-row: 4; display: block; }
  .sp-node-wrap { grid-column: 1 / 5; grid-row: 5; }
  .mob-conn-branch-from-sp { grid-column: 1 / 5; grid-row: 6; display: block; }
  
  .sec-node-wrap { grid-column: 1; grid-row: 7; }
  .aud-node-wrap { grid-column: 2; grid-row: 7; }
  .tre-node-wrap { grid-column: 3; grid-row: 7; }
  .spo-node-wrap { grid-column: 4; grid-row: 7; }
  
  .desk-conn-branch { display: none; }
  .conn-to-senate-desk { display: none; }
  .conn-to-senate-mob { grid-column: 1 / 5; grid-row: 8; display: block; }

  .tier-row {
    gap: 1rem;
    padding: 0.375rem 0;
  }
  .tier-row.two-up { gap: 0.75rem; }

  .connector { height: 20px; }
  .connector-to-senate { height: 12px; }

  /* Senator row: wrap */
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
