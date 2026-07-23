<script setup lang="ts">
import type { Officer } from '@/data/officers'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import OfficerCard from './OfficerCard.vue'

const props = defineProps<{
  officers: Officer[]
}>()

// ── Lookups by name ──
function find(namePart: string) {
  return computed(() => props.officers.find(o => o.name.includes(namePart)))
}

const president = find('Siason')
const vpAcademic = find('Jinon')
const campusAdmin = find('Balbona')
const sscChair = find('Ilisan-Sales')
const adminSupport = find('Baling')

// Coordinators — left column
const coordSubang = find('Subang')
const coordVerdeflorCoord = find('Verdeflor')
const coordAlada = find('Alada')
const coordEsmeralda = find('Esmeralda')
const coordDeslate = find('Deslate')

// Coordinators — right column
const coordDaguro = find('Daguro')
const coordBracamonte = find('Bracamonte')
const coordTanquerido = find('Tanquerido')
const coordBatislOng = find('Batisl')

// Federated USC
const fedAdviser = find('Katalbas')
const fedPresident = find('Depositario')

// USC Advisers
const uscAdviser = computed(() =>
  props.officers.find(o => o.name.includes('Verdeflor') && o.tier === 'usc_advisers')
)
const uscCoAdviser = find('Borcelo')

// USC Executive
const execPresident = find('Demonteverde')
const execVp = find('Bicodo')
const execSecretary = find('Danugrao')
const execAuditor = find('Parcia')
const execSenatePres = computed(() =>
  props.officers.find(o => o.name.includes('Daguro') && o.tier === 'usc_executive')
)
const execTreasurer = find('Manderico')
const execSpokesperson = find('Aqui')

// Student Senate
const senators = computed(() => props.officers.filter(o => o.tier === 'student_senate'))

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

// ── Auto-Scale: fit entire 1180px tree inside the container width ──
//
// KEY CONSTRAINT: CSS transform:scale() shrinks the *visual* size but leaves
// the element's *layout* footprint unchanged (still 1180px wide). So we MUST
// keep overflow-x:hidden on the wrapper to prevent horizontal scroll, and we
// compensate for the height by setting an explicit height on the wrapper equal
// to (natural height × scale).
const wrapperRef = ref<HTMLElement | null>(null)
const scaleFactor = ref(1)
const treeScaledHeight = ref<string>('auto')
const treeInnerRef = ref<HTMLElement | null>(null)

const TARGET_WIDTH = 1180   // design width the tree was built for

// Cached natural height — measured once at scale=1, reused on resize
let naturalHeightCache = 0

function updateScale() {
  if (!wrapperRef.value || !treeInnerRef.value) return

  const availableWidth = wrapperRef.value.clientWidth
  if (availableWidth <= 0) return

  if (availableWidth < TARGET_WIDTH) {
    const scale = availableWidth / TARGET_WIDTH   // exact fit, no clamping
    scaleFactor.value = scale

    // If we have no cached natural height yet, measure it.
    // We temporarily suspend the Vue binding by writing directly to style,
    // force a layout flush via scrollHeight read, then clear it so Vue's
    // reactive :style binding takes back over on the next microtask.
    if (!naturalHeightCache || naturalHeightCache === 0) {
      treeInnerRef.value.style.transform = 'none'
      naturalHeightCache = treeInnerRef.value.scrollHeight
      treeInnerRef.value.style.transform = ''
    }

    treeScaledHeight.value = `${naturalHeightCache * scale}px`
  } else {
    scaleFactor.value = 1
    treeScaledHeight.value = 'auto'
    naturalHeightCache = 0   // reset so it's re-measured if we resize smaller again
  }
}

let ro: ResizeObserver | null = null

onMounted(() => {
  ro = new ResizeObserver(() => updateScale())
  if (wrapperRef.value) ro.observe(wrapperRef.value)
  // Use two rAFs: first lets Vue finish its initial render,
  // second lets the browser perform a layout pass so scrollHeight is accurate.
  requestAnimationFrame(() => requestAnimationFrame(() => updateScale()))
})

onUnmounted(() => {
  ro?.disconnect()
  naturalHeightCache = 0
})

// Show the pinch hint when the chart is scaled below 60%
const showPinchHint = computed(() => scaleFactor.value < 0.60)
</script>

<template>
  <div class="chart-wrapper" ref="wrapperRef">
    <div class="chart-canvas">

      <!-- ═══════════════════════════════════════════════════════
           USC LOGO WATERMARK (luminosity blend, ghost effect)
           ═══════════════════════════════════════════════════════ -->
      <div class="watermark-layer" aria-hidden="true">
        <img
          src="/logo/USC_logo.jpg"
          alt=""
          class="watermark-img"
        />
      </div>

      <!-- ═══════════════════════════════════════════════════════
           SCALED TREE CONTAINER (Auto-fits viewport width)
           ═══════════════════════════════════════════════════════ -->
      <div class="tree-scale-wrapper" :style="{ height: treeScaledHeight }">
        <div
          class="tree-inner"
          ref="treeInnerRef"
          :style="{ transform: `scale(${scaleFactor})` }"
        >

          <!-- ── CHART HEADER ── -->
          <div class="chart-header">
            <div class="chart-header-subtitle">
              UNIVERSITY STUDENT COUNCIL — ISUFST DINGLE CAMPUS
            </div>
            <h2 class="chart-header-title">ORGANIZATIONAL CHART</h2>
            <div class="chart-header-ornament">
              <span class="ornament-line"></span>
              <span class="ornament-diamond">◆</span>
              <span class="ornament-line"></span>
            </div>
          </div>

          <!-- ── SECTION 1: TOP VERTICAL CHAIN ── -->
          <div class="admin-chain">

            <!-- Row 1: University President -->
            <div class="chain-row">
              <div class="chain-card" v-if="president">
                <OfficerCard
                  :name="president.name"
                  designation="University President"
                  :initials="getInitials(president.name)"
                  variant="institutional"
                />
              </div>
            </div>

            <!-- Vertical line -->
            <div class="v-line-segment"></div>

            <!-- Row 2: VP Academic Affairs -->
            <div class="chain-row">
              <div class="chain-card" v-if="vpAcademic">
                <OfficerCard
                  :name="vpAcademic.name"
                  designation="Vice President for Academic Affairs"
                  :initials="getInitials(vpAcademic.name)"
                  variant="institutional"
                />
              </div>
            </div>

            <!-- Vertical line -->
            <div class="v-line-segment"></div>

            <!-- Row 3: Campus Administrator -->
            <div class="chain-row">
              <div class="chain-card" v-if="campusAdmin">
                <OfficerCard
                  :name="campusAdmin.name"
                  designation="Campus Administrator"
                  :initials="getInitials(campusAdmin.name)"
                  variant="pivot"
                />
              </div>
            </div>

            <!-- Vertical line -->
            <div class="v-line-segment"></div>

            <!-- Row 4: OIC Chairperson + Side Branch -->
            <!-- Uses position:relative on the row so the side-branch can be absolute-positioned
                 without shifting the main card off the vertical center spine -->
            <div class="chain-row row-with-branch">
              <!-- Main card stays centered on the vertical spine -->
              <div class="chain-card" v-if="sscChair">
                <OfficerCard
                  :name="sscChair.name"
                  designation="OIC Chairperson, Student Support Center"
                  :initials="getInitials(sscChair.name)"
                  variant="institutional"
                />
              </div>

              <!-- Side branch: absolutely positioned so main card isn't displaced -->
              <div class="side-branch" v-if="adminSupport">
                <div class="h-line-connector"></div>
                <div class="branch-card">
                  <OfficerCard
                    :name="adminSupport.name"
                    designation="Administrative Support Staff, SSC"
                    :initials="getInitials(adminSupport.name)"
                    variant="institutional"
                  />
                </div>
              </div>
            </div>

          </div>

          <!-- ── SECTION 2: CONNECTOR TO COORDINATORS ── -->
          <!-- Vertical drop from the SSC Chairperson card to the T-bar -->
          <div class="v-line-segment line-to-coords"></div>
          <!-- Horizontal T-bar spanning the two coordinator columns -->
          <div class="coords-t-bar">
            <div class="coords-t-line"></div>
            <div class="coords-t-stems">
              <div class="coords-t-stem"></div>
              <div class="coords-t-stem"></div>
            </div>
          </div>

          <!-- ── SECTION 3: SSC COORDINATORS (2-column grid) ── -->
          <div class="section-label">
            <span class="label-badge label-gold">SSC Coordinators</span>
          </div>

          <div class="coordinators-grid">
            <!-- Left Column -->
            <div class="coord-col">
              <div class="coord-card" v-if="coordSubang">
                <OfficerCard
                  :name="coordSubang.name"
                  designation="Coordinator, Recreation & Sports"
                  :initials="getInitials(coordSubang.name)"
                  variant="institutional"
                />
              </div>
              <div class="coord-card" v-if="coordVerdeflorCoord">
                <OfficerCard
                  :name="coordVerdeflorCoord.name"
                  designation="Coordinator, Guidance and Testing"
                  :initials="getInitials(coordVerdeflorCoord.name)"
                  variant="institutional"
                />
              </div>
              <div class="coord-card" v-if="coordAlada">
                <OfficerCard
                  :name="coordAlada.name"
                  designation="Coordinator, Student Publication"
                  :initials="getInitials(coordAlada.name)"
                  variant="institutional"
                />
              </div>
              <div class="coord-card" v-if="coordEsmeralda">
                <OfficerCard
                  :name="coordEsmeralda.name"
                  designation="Coordinator, Student Organization"
                  :initials="getInitials(coordEsmeralda.name)"
                  variant="institutional"
                />
              </div>
              <div class="coord-card" v-if="coordDeslate">
                <OfficerCard
                  :name="coordDeslate.name"
                  designation="University Psychometrician"
                  :initials="getInitials(coordDeslate.name)"
                  variant="institutional"
                />
              </div>
            </div>

            <!-- Right Column -->
            <div class="coord-col">
              <div class="coord-card" v-if="coordDaguro">
                <OfficerCard
                  :name="coordDaguro.name"
                  designation="Coordinator, Cultural Affairs"
                  :initials="getInitials(coordDaguro.name)"
                  variant="institutional"
                />
              </div>
              <div class="coord-card" v-if="coordBracamonte">
                <OfficerCard
                  :name="coordBracamonte.name"
                  designation="Coordinator, Health Services"
                  :initials="getInitials(coordBracamonte.name)"
                  variant="institutional"
                />
              </div>
              <div class="coord-card" v-if="coordTanquerido">
                <OfficerCard
                  :name="coordTanquerido.name"
                  designation="Coordinator, Dormitory & Housing"
                  :initials="getInitials(coordTanquerido.name)"
                  variant="institutional"
                />
              </div>
              <div class="coord-card" v-if="coordBatislOng">
                <OfficerCard
                  :name="coordBatislOng.name"
                  designation="Coordinator, Scholarship"
                  :initials="getInitials(coordBatislOng.name)"
                  variant="institutional"
                />
              </div>
            </div>
          </div>

          <!-- ── SECTION 4: MIDDLE LAYER (3 sections) ── -->
          <!-- Vertical drop then horizontal T-bar splitting into 3 sections -->
          <div class="v-line-segment"></div>
          <div class="middle-t-bar">
            <div class="middle-t-line"></div>
            <div class="middle-t-stems">
              <div class="middle-t-stem"></div>
              <div class="middle-t-stem"></div>
              <div class="middle-t-stem"></div>
            </div>
          </div>

          <div class="middle-layer">
            <!-- Section A: Federated USC -->
            <div class="layer-section">
              <div class="section-label">
                <span class="label-badge label-gold">Federated University Student Council</span>
              </div>
              <div class="stacked-cards">
                <div class="stack-card" v-if="fedAdviser">
                  <OfficerCard
                    :name="fedAdviser.name"
                    designation="Adviser"
                    :initials="getInitials(fedAdviser.name)"
                    variant="institutional"
                  />
                </div>
                <div class="v-line-short"></div>
                <div class="stack-card" v-if="fedPresident">
                  <OfficerCard
                    :name="fedPresident.name"
                    designation="President"
                    :initials="getInitials(fedPresident.name)"
                    variant="pivot"
                  />
                </div>
              </div>
            </div>

            <!-- Section B: USC Advisers -->
            <div class="layer-section">
              <div class="section-label">
                <span class="label-badge label-blue">USC Advisers</span>
              </div>
              <div class="stacked-cards">
                <div class="stack-card" v-if="uscAdviser">
                  <OfficerCard
                    :name="uscAdviser.name"
                    designation="Adviser"
                    :initials="getInitials(uscAdviser.name)"
                    variant="institutional"
                  />
                </div>
                <div class="v-line-short"></div>
                <div class="stack-card" v-if="uscCoAdviser">
                  <OfficerCard
                    :name="uscCoAdviser.name"
                    designation="Co-Adviser"
                    :initials="getInitials(uscCoAdviser.name)"
                    variant="institutional"
                  />
                </div>
              </div>
            </div>

            <!-- Section C: USC Executive Officers -->
            <div class="layer-section section-wide">
              <div class="section-label">
                <span class="label-badge label-gold">USC Executive Officers</span>
              </div>
              <div class="exec-tree">
                <!-- President -->
                <div class="exec-row" v-if="execPresident">
                  <OfficerCard
                    :name="execPresident.name"
                    designation="President"
                    :email="execPresident.email"
                    :initials="getInitials(execPresident.name)"
                    variant="executive"
                  />
                </div>
                <div class="v-line-short"></div>
                <!-- VP -->
                <div class="exec-row" v-if="execVp">
                  <OfficerCard
                    :name="execVp.name"
                    designation="Vice President"
                    :email="execVp.email"
                    :initials="getInitials(execVp.name)"
                    variant="executive"
                  />
                </div>
                <!-- Branch to 3 officers -->
                <div class="branch-split">
                  <div class="branch-horizontal"></div>
                  <div class="branch-stems">
                    <div class="branch-stem"></div>
                    <div class="branch-stem"></div>
                    <div class="branch-stem"></div>
                  </div>
                </div>
                <div class="exec-row-three">
                  <div class="exec-cell" v-if="execSenatePres">
                    <OfficerCard
                      :name="execSenatePres.name"
                      designation="Senate President"
                      :email="execSenatePres.email"
                      :initials="getInitials(execSenatePres.name)"
                      variant="committee"
                    />
                  </div>
                  <div class="exec-cell" v-if="execSecretary">
                    <OfficerCard
                      :name="execSecretary.name"
                      designation="Secretary"
                      :email="execSecretary.email"
                      :initials="getInitials(execSecretary.name)"
                      variant="committee"
                    />
                  </div>
                  <div class="exec-cell" v-if="execTreasurer">
                    <OfficerCard
                      :name="execTreasurer.name"
                      designation="Treasurer"
                      :email="execTreasurer.email"
                      :initials="getInitials(execTreasurer.name)"
                      variant="committee"
                    />
                  </div>
                </div>
                <!-- Branch to 2 officers (centered) -->
                <div class="branch-split branch-split-small">
                  <div class="branch-horizontal branch-horizontal-short"></div>
                  <div class="branch-stems">
                    <div class="branch-stem"></div>
                    <div class="branch-stem"></div>
                  </div>
                </div>
                <div class="exec-row-two">
                  <div class="exec-cell" v-if="execAuditor">
                    <OfficerCard
                      :name="execAuditor.name"
                      designation="Auditor"
                      :email="execAuditor.email"
                      :initials="getInitials(execAuditor.name)"
                      variant="committee"
                    />
                  </div>
                  <div class="exec-cell" v-if="execSpokesperson">
                    <OfficerCard
                      :name="execSpokesperson.name"
                      designation="Spokesperson"
                      :email="execSpokesperson.email"
                      :initials="getInitials(execSpokesperson.name)"
                      variant="committee"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── SECTION 5: STUDENT SENATE ── -->
          <!-- Vertical drop from exec section to senate T-bar -->
          <div class="v-line-segment line-teal"></div>
          <!-- Horizontal T-bar splitting into 7 senator columns -->
          <div class="senate-t-bar">
            <div class="senate-t-line"></div>
            <div class="senate-t-stems">
              <div class="senate-t-stem" v-for="n in 7" :key="n"></div>
            </div>
          </div>

          <div class="section-label">
            <span class="label-badge label-teal">Student Senate</span>
          </div>

          <div class="senate-row">
            <div
              v-for="senator in senators"
              :key="senator.name"
              class="senate-cell"
            >
              <OfficerCard
                :name="senator.name"
                designation="Senator"
                :initials="getInitials(senator.name)"
                variant="senate"
              />
            </div>
          </div>

        </div> <!-- /.tree-inner -->
      </div> <!-- /.tree-scale-wrapper -->

      <!-- ── Pinch-to-zoom hint (only shown on touch devices when chart is scaled) ── -->
      <div v-if="showPinchHint" class="pinch-hint" aria-hidden="true">
        <svg class="pinch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v3m0 9v3m-7.5-7.5h3m9 0h3M6.343 6.343l2.122 2.122m7.07 7.07 2.122 2.122M6.343 17.657l2.122-2.122m7.07-7.07 2.122-2.122"/>
        </svg>
        <span>Pinch to zoom</span>
      </div>

      <!-- ═══════════════════════════════════════════════════════
           GRAPHIC FOOTER BANNER (100% width, flush to container edges)
           ═══════════════════════════════════════════════════════ -->
      <div class="chart-footer-graphic">
        <img
          src="/usc-org-chart-footer.png"
          alt="ISUFST USC Core Values - Integrity, Social Justice, Discipline, Academic Excellence"
          class="footer-graphic-img"
        />
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   WRAPPER & CANVAS — NO HORIZONTAL SCROLLBAR
   ══════════════════════════════════════════ */
.chart-wrapper {
  width: 100%;
  /* overflow-x:hidden clips the 1180px layout footprint that transform:scale()
     leaves behind, preventing horizontal scroll without blocking pinch-to-zoom
     (browser zoom works at viewport level, not CSS overflow level). */
  overflow-x: hidden;
  background: #0B132B;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  /* Forward pinch gestures to the browser's native zoom */
  touch-action: pan-y pinch-zoom;
}

.chart-canvas {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 100%;
  padding: 2.5rem 0 0 0;
  overflow: hidden;   /* clips overflowed tree content within the canvas */
  box-sizing: border-box;

  background:
    radial-gradient(ellipse at 50% 22%, #1a2a62 0%, #0b132b 55%, #060a1a 100%),
    linear-gradient(180deg, #0b132b 0%, #091128 50%, #0b132b 100%);
}

/* Diagonal shimmer sweep overlay */
.chart-canvas::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    transparent 0%,
    rgba(255, 255, 255, 0.015) 35%,
    rgba(255, 255, 255, 0.03) 50%,
    rgba(255, 255, 255, 0.015) 65%,
    transparent 100%
  );
  pointer-events: none;
  z-index: 0;
}

/* ── USC Logo Watermark ── */
.watermark-layer {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 75%;
  max-width: 900px;
  aspect-ratio: 1;
  pointer-events: none;
  z-index: 0;
}

.watermark-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.055;
  mix-blend-mode: luminosity;
  filter: grayscale(1) contrast(1.1);
  border-radius: 50%;
}

/* ── Tree Auto-Scaling Wrapper ── */
.tree-scale-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 2;
  transition: height 0.15s ease;
  overflow: hidden;   /* clips the scaled tree's layout footprint */
}

.tree-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 1180px;
  flex-shrink: 0;
  transform-origin: top center;
  transition: transform 0.15s ease;
  will-change: transform;
}

/* ── GRAPHIC FOOTER BANNER ──
   mix-blend-mode:multiply makes the white background in the PNG invisible
   against the dark navy chart: white(255) × dark = dark = transparent-effect */
.chart-footer-graphic {
  width: 100%;
  margin-top: 1.5rem;
  margin-bottom: -2px;
  z-index: 2;
  display: block;
  line-height: 0;
  background: transparent;
  overflow: hidden;
}

.footer-graphic-img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
  transform: scale(1.22);
  transform-origin: center center;
  margin: 0;
  padding: 0;
  /* Blend white areas of the PNG into the dark background = transparent effect */
  mix-blend-mode: multiply;
}

/* ══════════════════════════════════════════
   CHART HEADER
   ══════════════════════════════════════════ */
.chart-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 2rem;
  text-align: center;
}

.chart-header-subtitle {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(201, 162, 75, 0.6);
}

.chart-header-title {
  font-family: 'Georgia', 'Palatino Linotype', serif;
  font-size: 1.85rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin: 0;
  background: linear-gradient(
    135deg,
    #c9a24b 0%,
    #f0d870 40%,
    #e4cd8e 55%,
    #b8922a 85%,
    #c9a24b 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 2px 8px rgba(201, 162, 75, 0.3));
}

.chart-header-ornament {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 280px;
  margin-top: 0.2rem;
}

.ornament-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(201, 162, 75, 0.55), transparent);
}

.ornament-diamond {
  font-size: 0.5rem;
  color: rgba(201, 162, 75, 0.7);
  line-height: 1;
}

/* ══════════════════════════════════════════
   ADMIN CHAIN
   ══════════════════════════════════════════ */
.admin-chain {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chain-row {
  display: flex;
  justify-content: center;
  padding: 0.2rem 0;
}

.chain-card {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   VERTICAL LINE SEGMENTS
   ══════════════════════════════════════════ */
.v-line-segment {
  width: 1.5px;
  height: 36px;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.75), rgba(201, 162, 75, 0.2));
  box-shadow: 0 0 8px rgba(201, 162, 75, 0.25);
  filter: drop-shadow(0 0 3px rgba(201, 162, 75, 0.3));
  flex-shrink: 0;
}

.v-line-short {
  width: 1.5px;
  height: 22px;
  background: linear-gradient(to bottom, rgba(201, 162, 75, 0.7), rgba(201, 162, 75, 0.2));
  box-shadow: 0 0 6px rgba(201, 162, 75, 0.2);
  margin: 0 auto;
  flex-shrink: 0;
}

.line-teal {
  background: linear-gradient(to bottom, rgba(45, 188, 168, 0.7), rgba(45, 188, 168, 0.2));
  box-shadow: 0 0 8px rgba(45, 188, 168, 0.25);
  filter: drop-shadow(0 0 3px rgba(45, 188, 168, 0.3));
}

.line-to-coords {
  height: 28px;
}

/* ══════════════════════════════════════════
   SIDE BRANCH (Row 4)
   ══════════════════════════════════════════ */
.row-with-branch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  position: relative; /* enables absolute side-branch */
}

/* Side branch is absolutely positioned so the main card stays centered */
.side-branch {
  position: absolute;
  left: calc(50% + 131px); /* 131px = half the max-width of institutional card (262px) */
  display: flex;
  align-items: center;
  top: 50%;
  transform: translateY(-50%);
}

.h-line-connector {
  width: 32px;
  height: 1.5px;
  background: linear-gradient(to right, rgba(201, 162, 75, 0.75), rgba(201, 162, 75, 0.3));
  box-shadow: 0 0 5px rgba(201, 162, 75, 0.2);
  flex-shrink: 0;
}

.branch-card { flex-shrink: 0; }

/* ══════════════════════════════════════════
   SECTION LABELS
   ══════════════════════════════════════════ */
.section-label {
  text-align: center;
  margin-bottom: 0.75rem;
}

.label-badge {
  font-size: 0.58rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 700;
  padding: 0.32rem 0.85rem;
  border-radius: 999px;
  display: inline-block;
  white-space: nowrap;
}

.label-gold {
  color: rgba(228, 205, 142, 0.85);
  border: 1px solid rgba(201, 162, 75, 0.35);
  background: rgba(201, 162, 75, 0.1);
  box-shadow: 0 0 10px rgba(201, 162, 75, 0.08);
}

.label-blue {
  color: rgba(160, 200, 255, 0.9);
  border: 1px solid rgba(100, 150, 240, 0.3);
  background: rgba(100, 150, 240, 0.09);
  box-shadow: 0 0 10px rgba(100, 150, 240, 0.08);
}

.label-teal {
  color: rgba(80, 220, 200, 0.85);
  border: 1px solid rgba(45, 188, 168, 0.3);
  background: rgba(45, 188, 168, 0.09);
  box-shadow: 0 0 10px rgba(45, 188, 168, 0.08);
}

/* ══════════════════════════════════════════
   COORDINATOR T-BAR CONNECTOR
   ══════════════════════════════════════════ */
.coords-t-bar {
  position: relative;
  width: 620px;
  height: 24px;
  flex-shrink: 0;
}

.coords-t-line {
  position: absolute;
  top: 0;
  left: 17%;    /* aligned with left column center */
  right: 17%;   /* aligned with right column center */
  height: 1.5px;
  background: linear-gradient(
    to right,
    rgba(201, 162, 75, 0.2),
    rgba(201, 162, 75, 0.65),
    rgba(201, 162, 75, 0.2)
  );
  box-shadow: 0 0 5px rgba(201, 162, 75, 0.2);
}

.coords-t-stems {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 17%;
}

.coords-t-stem {
  width: 1.5px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(201, 162, 75, 0.65),
    rgba(201, 162, 75, 0.2)
  );
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

/* ══════════════════════════════════════════
   COORDINATORS GRID (2 columns)
   ══════════════════════════════════════════ */
.coordinators-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 2.5rem;
  max-width: 620px;
  width: 100%;
}

.coord-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.coord-card {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   MIDDLE LAYER T-BAR CONNECTOR (3-way)
   ══════════════════════════════════════════ */
.middle-t-bar {
  position: relative;
  width: 900px; /* spans the full width of the 3-column middle layer */
  height: 24px;
  flex-shrink: 0;
}

.middle-t-line {
  position: absolute;
  top: 0;
  left: 13%;
  right: 13%;
  height: 1.5px;
  background: linear-gradient(
    to right,
    rgba(201, 162, 75, 0.2),
    rgba(201, 162, 75, 0.65),
    rgba(201, 162, 75, 0.2)
  );
  box-shadow: 0 0 5px rgba(201, 162, 75, 0.2);
}

.middle-t-stems {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  padding: 0 13%;
}

.middle-t-stem {
  width: 1.5px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(201, 162, 75, 0.65),
    rgba(201, 162, 75, 0.2)
  );
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

/* ══════════════════════════════════════════
   MIDDLE LAYER (3 sections)
   ══════════════════════════════════════════ */
.middle-layer {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
  justify-content: center;
  padding: 0 0 0.5rem 0; /* remove top padding — T-bar handles the gap */
}

.layer-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  min-width: 240px;
}

.section-wide { min-width: 360px; }

.stacked-cards {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.stack-card {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   EXECUTIVE TREE
   ══════════════════════════════════════════ */
.exec-tree {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.exec-row {
  display: flex;
  justify-content: center;
  padding: 0.2rem 0;
}

/* Branch split connector */
.branch-split {
  position: relative;
  width: 100%;
  height: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.branch-split-small { height: 20px; }

.branch-horizontal {
  position: absolute;
  top: 0;
  left: 15%;
  right: 15%;
  height: 1.5px;
  background: linear-gradient(
    to right,
    rgba(201, 162, 75, 0.2),
    rgba(201, 162, 75, 0.65),
    rgba(201, 162, 75, 0.2)
  );
  box-shadow: 0 0 5px rgba(201, 162, 75, 0.2);
}

.branch-horizontal-short {
  left: 40%;
  right: 40%;
}

.branch-stems {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  padding: 0 15%;
}

.branch-split-small .branch-stems {
  padding: 0 40%;
  justify-content: center;
}

.branch-stem {
  width: 1.5px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(201, 162, 75, 0.65),
    rgba(201, 162, 75, 0.2)
  );
  box-shadow: 0 0 4px rgba(201, 162, 75, 0.15);
}

.exec-row-three {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  width: 100%;
}

.exec-row-two {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

.exec-cell {
  display: flex;
  justify-content: center;
}

/* ══════════════════════════════════════════
   SENATE T-BAR CONNECTOR (7-way)
   ══════════════════════════════════════════ */
.senate-t-bar {
  position: relative;
  width: 100%;
  max-width: 1100px;
  height: 24px;
  flex-shrink: 0;
}

.senate-t-line {
  position: absolute;
  top: 0;
  left: calc(100% / 14);   /* aligned with center of first senator column */
  right: calc(100% / 14);  /* aligned with center of last senator column */
  height: 1.5px;
  background: linear-gradient(
    to right,
    rgba(45, 188, 168, 0.15),
    rgba(45, 188, 168, 0.6),
    rgba(45, 188, 168, 0.15)
  );
  box-shadow: 0 0 5px rgba(45, 188, 168, 0.2);
}

.senate-t-stems {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  padding: 0 calc(100% / 14);
}

.senate-t-stem {
  width: 1.5px;
  height: 100%;
  background: linear-gradient(
    to bottom,
    rgba(45, 188, 168, 0.6),
    rgba(45, 188, 168, 0.15)
  );
  box-shadow: 0 0 4px rgba(45, 188, 168, 0.2);
}

/* ══════════════════════════════════════════
   SENATE ROW
   ══════════════════════════════════════════ */
.senate-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
  width: 100%;
  max-width: 1100px;
}

.senate-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 5px 8px; /* reduced top padding — T-bar stems now handle the drop */
}

/* Remove the old CSS connector lines on senate-cell since the T-bar replaces them */
.senate-cell::before { display: none; }
.senate-cell::after  { display: none; }

/* ══════════════════════════════════════════
   FOOTER GRAPHIC — Fix overflow
   ══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   PINCH-TO-ZOOM HINT (touch screens only)
   ══════════════════════════════════════════ */
.pinch-hint {
  display: none; /* hidden by default — only show on touch screens */
}

@media (hover: none) {
  .pinch-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.45rem 1rem;
    margin: 0.75rem auto 0;
    width: fit-content;
    background: rgba(201, 162, 75, 0.1);
    border: 1px solid rgba(201, 162, 75, 0.25);
    border-radius: 999px;
    color: rgba(228, 205, 142, 0.75);
    font-size: 0.7rem;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.06em;
    pointer-events: none;
    animation: fadeHint 3s ease forwards;
    animation-delay: 1.2s;
    opacity: 0;
  }

  .pinch-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
}

@keyframes fadeHint {
  0%   { opacity: 0; transform: translateY(4px); }
  15%  { opacity: 1; transform: translateY(0); }
  75%  { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-4px); }
}
</style>
