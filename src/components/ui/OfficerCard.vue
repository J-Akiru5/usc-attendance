<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  name?: string
  designation: string
  email?: string
  photo?: string
  initials: string
  variant: 'institutional' | 'pivot' | 'executive' | 'committee' | 'senate'
  showEmail?: boolean
  flagged?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showEmail: undefined,
  flagged: false
})

// Determine whether email should be shown based on variant and prop override
const shouldShowEmail = computed(() => {
  if (props.showEmail !== undefined) {
    return props.showEmail
  }
  // Default tier visibility rules:
  // - executive (USC President/VP) and committee (Treasurer, etc.) show email
  // - institutional, pivot, and senate do NOT show email
  return props.variant === 'executive' || props.variant === 'committee'
})

const variantClass = computed(() => {
  return `card-${props.variant}`
})
</script>

<template>
  <div class="officer-card" :class="[variantClass, { 'card-flagged': flagged }]">
    <!-- Metallic sheen layer (decorative, pointer-events:none) -->
    <div class="card-sheen" aria-hidden="true"></div>

    <!-- Avatar Section -->
    <div class="avatar-wrap">
      <img
        v-if="photo"
        :src="photo"
        :alt="name || designation"
        class="avatar-img"
      />
      <!-- SVG silhouette bust — replaces initials fallback -->
      <div v-else class="avatar-silhouette">
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          class="silhouette-svg"
          aria-hidden="true"
        >
          <!-- Head circle -->
          <circle cx="24" cy="16" r="9" fill="currentColor" opacity="0.85"/>
          <!-- Shoulders / body -->
          <path
            d="M6 44c0-9.941 8.059-18 18-18s18 8.059 18 18"
            fill="currentColor"
            opacity="0.7"
          />
        </svg>
      </div>
    </div>

    <!-- Info Section -->
    <div class="info-wrap">
      <span v-if="flagged" class="info-name name-flagged">Name to confirm</span>
      <span v-else-if="name" class="info-name">{{ name }}</span>
      
      <span class="info-designation">{{ designation }}</span>
      
      <div v-if="shouldShowEmail && email" class="info-email">
        <svg class="email-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
        <span class="email-text">{{ email }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   BASE CARD — Metallic Foundation
   ══════════════════════════════════════════ */
.officer-card {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.625rem;
  padding: 0.75rem 0.875rem;
  transition:
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.22s ease;
  box-sizing: border-box;
  text-align: left;
  border: 1px solid transparent;
  overflow: hidden; /* contain sheen pseudo-element */
}

.officer-card:hover {
  transform: translateY(-3px);
}

/* ── Diagonal metallic sheen strip ── */
.card-sheen {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    118deg,
    transparent 20%,
    rgba(255, 255, 255, 0.07) 45%,
    rgba(255, 255, 255, 0.12) 50%,
    rgba(255, 255, 255, 0.07) 55%,
    transparent 80%
  );
  z-index: 1;
}

/* ── Avatar ── */
.avatar-wrap {
  width: var(--avatar-size, 46px);
  height: var(--avatar-size, 46px);
  border-radius: 0.45rem;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--avatar-border, rgba(255, 255, 255, 0.12));
  background: var(--avatar-bg, rgba(255, 255, 255, 0.06));
  display: flex;
  align-items: flex-end;
  justify-content: center;
  position: relative;
  z-index: 2;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-silhouette {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  color: var(--silhouette-color, rgba(255, 255, 255, 0.5));
  padding-bottom: 0;
  overflow: hidden;
}

.silhouette-svg {
  width: 88%;
  height: 88%;
  display: block;
  margin-bottom: -4px; /* let shoulders bleed to bottom edge */
}

/* ── Info wrap ── */
.info-wrap {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  flex-grow: 1;
  position: relative;
  z-index: 2;
}

.info-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--name-color, #ffffff);
  line-height: 1.25;
  white-space: normal;
  word-break: break-word;
  letter-spacing: -0.01em;
}

.info-designation {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--designation-color, rgba(255, 255, 255, 0.6));
  margin-top: 0.15rem;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.055em;
}

.info-email {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.35rem;
  font-size: 0.6rem;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.35);
  min-width: 0;
}

.email-icon { width: 0.72rem; height: 0.72rem; }
.email-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ══════════════════════════════════════════
   TIER VARIANTS — Metallic Gradients
   ══════════════════════════════════════════ */

/* ── Tier 1: Institutional — navy-gold metallic ── */
.card-institutional {
  width: 100%;
  max-width: 262px;
  background: linear-gradient(
    148deg,
    #1c2848 0%,
    #253568 40%,
    #1e2d5c 70%,
    #151f40 100%
  );
  border-color: rgba(201, 162, 75, 0.45);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(201, 162, 75, 0.18),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
  --avatar-size: 50px;
  --avatar-bg: linear-gradient(145deg, rgba(201, 162, 75, 0.22), rgba(201, 162, 75, 0.08));
  --avatar-border: rgba(201, 162, 75, 0.3);
  --silhouette-color: rgba(228, 205, 142, 0.7);
  --name-color: #f0e8cc;
  --designation-color: rgba(201, 162, 75, 0.9);
}

.card-institutional .info-name {
  font-size: 0.875rem;
  font-weight: 800;
}

.card-institutional:hover {
  border-color: rgba(201, 162, 75, 0.7);
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.65),
    inset 0 1px 0 rgba(201, 162, 75, 0.28),
    0 0 0 1px rgba(201, 162, 75, 0.18);
}

/* ── Tier 2: Pivot — deeper navy, stronger gold border ── */
.card-pivot {
  width: 100%;
  max-width: 262px;
  background: linear-gradient(
    148deg,
    #18234a 0%,
    #223070 45%,
    #1b2860 75%,
    #131d42 100%
  );
  border-color: rgba(201, 162, 75, 0.6);
  border-width: 1.5px;
  box-shadow:
    0 8px 22px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(201, 162, 75, 0.22),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(201, 162, 75, 0.12);
  --avatar-size: 50px;
  --avatar-bg: linear-gradient(145deg, rgba(201, 162, 75, 0.28), rgba(201, 162, 75, 0.1));
  --avatar-border: rgba(201, 162, 75, 0.38);
  --silhouette-color: rgba(228, 205, 142, 0.8);
  --name-color: #f5edda;
  --designation-color: rgba(228, 205, 142, 0.95);
}

.card-pivot .info-name {
  font-size: 0.875rem;
  font-weight: 800;
}

.card-pivot:hover {
  border-color: rgba(201, 162, 75, 0.85);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.7),
    inset 0 1px 0 rgba(201, 162, 75, 0.32),
    0 0 0 1px rgba(201, 162, 75, 0.25);
}

/* ── Tier 3: Executive — bright gold metallic (USC Pres / VP) ── */
.card-executive {
  width: 100%;
  max-width: 292px;
  background: linear-gradient(
    138deg,
    #a07828 0%,
    #d4ac48 20%,
    #f0d870 42%,
    #e8ca58 55%,
    #c49830 75%,
    #8a6820 100%
  );
  border: 1.5px solid rgba(255, 235, 130, 0.5);
  box-shadow:
    0 10px 30px rgba(180, 130, 20, 0.45),
    0 2px 8px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 200, 0.4),
    inset 0 -2px 0 rgba(80, 50, 0, 0.4);
  --avatar-size: 54px;
  --avatar-bg: linear-gradient(145deg, rgba(12, 27, 54, 0.55), rgba(12, 27, 54, 0.35));
  --avatar-border: rgba(255, 255, 255, 0.25);
  --silhouette-color: rgba(240, 216, 112, 0.85);
  --name-color: #0c1b36;
  --designation-color: rgba(12, 27, 54, 0.78);
}

.card-executive .info-name {
  color: #0c1b36;
  font-size: 0.92rem;
  font-weight: 800;
}

.card-executive .info-designation {
  color: rgba(12, 27, 54, 0.75);
  font-size: 0.72rem;
  font-weight: 700;
}

.card-executive .info-email {
  color: rgba(12, 27, 54, 0.55);
}

.card-executive:hover {
  border-color: rgba(255, 245, 160, 0.75);
  box-shadow:
    0 14px 38px rgba(201, 162, 75, 0.55),
    0 4px 12px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 220, 0.5);
}

/* Override sheen on executive — lighter, brighter */
.card-executive .card-sheen {
  background: linear-gradient(
    118deg,
    transparent 18%,
    rgba(255, 255, 255, 0.12) 42%,
    rgba(255, 255, 255, 0.22) 50%,
    rgba(255, 255, 255, 0.12) 58%,
    transparent 82%
  );
}

/* ── Tier 4: Committee — steel-blue metallic ── */
.card-committee {
  width: 100%;
  max-width: 252px;
  background: linear-gradient(
    148deg,
    #182050 0%,
    #1d2c6e 40%,
    #182458 70%,
    #111a42 100%
  );
  border-color: rgba(100, 150, 240, 0.42);
  box-shadow:
    0 5px 16px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(120, 170, 255, 0.18),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
  --avatar-size: 46px;
  --avatar-bg: linear-gradient(145deg, rgba(100, 150, 240, 0.22), rgba(80, 120, 210, 0.08));
  --avatar-border: rgba(100, 150, 240, 0.3);
  --silhouette-color: rgba(160, 200, 255, 0.7);
  --name-color: #e8eeff;
  --designation-color: rgba(160, 200, 255, 0.88);
}

.card-committee .info-email {
  color: rgba(255, 255, 255, 0.38);
}

.card-committee:hover {
  border-color: rgba(120, 170, 255, 0.65);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(140, 190, 255, 0.25),
    0 0 0 1px rgba(100, 150, 255, 0.18);
}

/* Override sheen on committee — cooler/bluer */
.card-committee .card-sheen {
  background: linear-gradient(
    118deg,
    transparent 20%,
    rgba(140, 180, 255, 0.06) 45%,
    rgba(200, 220, 255, 0.12) 50%,
    rgba(140, 180, 255, 0.06) 55%,
    transparent 80%
  );
}

/* ── Tier 5: Senate — teal-steel metallic ── */
.card-senate {
  width: 100%;
  max-width: 192px;
  background: linear-gradient(
    148deg,
    #0c2e2a 0%,
    #143d38 42%,
    #102e2a 72%,
    #081e1c 100%
  );
  border-color: rgba(45, 188, 168, 0.42);
  padding: 0.6rem 0.75rem;
  box-shadow:
    0 4px 14px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(60, 220, 195, 0.15),
    inset 0 -1px 0 rgba(0, 0, 0, 0.28);
  --avatar-size: 36px;
  --avatar-bg: linear-gradient(145deg, rgba(45, 188, 168, 0.2), rgba(30, 150, 135, 0.08));
  --avatar-border: rgba(45, 188, 168, 0.28);
  --silhouette-color: rgba(80, 220, 200, 0.75);
  --name-color: #d8f8f4;
  --designation-color: rgba(80, 220, 200, 0.88);
}

.card-senate .info-name {
  font-size: 0.75rem;
  white-space: normal;
  word-break: break-word;
}

.card-senate .info-designation {
  font-size: 0.62rem;
}

.card-senate:hover {
  border-color: rgba(60, 210, 188, 0.65);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(80, 230, 205, 0.2),
    0 0 0 1px rgba(45, 188, 168, 0.18);
}

/* Override sheen on senate — teal-cool */
.card-senate .card-sheen {
  background: linear-gradient(
    118deg,
    transparent 20%,
    rgba(60, 220, 195, 0.05) 45%,
    rgba(100, 240, 215, 0.1) 50%,
    rgba(60, 220, 195, 0.05) 55%,
    transparent 80%
  );
}

/* ══════════════════════════════════════════
   FLAGGED STYLING (Unconfirmed Names)
   ══════════════════════════════════════════ */
.card-flagged {
  border: 1px dashed rgba(239, 68, 68, 0.4) !important;
  background: rgba(239, 68, 68, 0.04) !important;
  --avatar-bg: rgba(239, 68, 68, 0.08) !important;
  --silhouette-color: rgba(239, 68, 68, 0.7) !important;
}

.card-flagged:hover {
  border-color: rgba(239, 68, 68, 0.7) !important;
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.1) !important;
}

.name-flagged {
  color: rgba(239, 68, 68, 0.85) !important;
  font-style: italic;
}

/* ══════════════════════════════════════════
   TOUCH / MOBILE — hover disabled only
   The OrgChart scales the entire tree via CSS transform, so no per-card
   size overrides are needed here. Applying them would cause double-shrink
   (media query fires at device width, then the whole tree gets scaled down).
   ══════════════════════════════════════════ */
@media (hover: none) {
  .officer-card:hover { transform: none; }
}
</style>
