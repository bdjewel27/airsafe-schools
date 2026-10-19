# AirSafe Schools: Top 5 UX Architecture Decisions (U-10)

## Overview
AirSafe Schools is designed for busy primary and secondary school teachers in Bangladesh who have less than 3 minutes between class transitions to determine if children can safely go outdoors. Every design decision optimizes for cognitive calm, rapid verification, and zero ambiguity.

---

## 1. Decision 1: Action-First Hierarchy over Data Dashboards (U-1)
* **Rationale**: When a teacher opens their phone at 7:55 AM on a bumpy commute, they need an immediate answer to one burning question: *"Can my students go outside right now?"*
* **Design Implementation**: The landing screen leads with a single, unambiguous outdoor status card: **"MOVE INDOORS" (ভেতরে নিন)** or **"PROCEED" (বাইরে যাওয়া নিরাপদ)**. No raw PM2.5 or temperature numbers precede the action. Numerical details appear in secondary positions only to substantiate the recommendation.

---

## 2. Decision 2: Redundant Visual & Accessible Encoding (U-2 & U-6)
* **Rationale**: Color blindness, direct harsh sunlight on low-cost phone screens, and high-glare environments make relying solely on green/yellow/red dangerous.
* **Design Implementation**:
  - Every status pairs standard semantic colors with an explicit high-contrast icon (`Cancel`, `Warning`, `CheckCircle`) and bold textual verdicts in English and Bengali.
  - Text contrast exceeds WCAG AAA $\ge 4.5:1$ (`SafeGreen: #1B5E20`, `DangerRed: #B71C1C`).
  - Screen reader semantics provide rich contextual summaries for TalkBack users with touch targets strictly $\ge 48\text{ dp}$.

---

## 3. Decision 3: Comprehensive State Handling & Zero False Success (U-3)
* **Rationale**: Teachers must never mistake stale cached data or loading states for a live safe condition.
* **Design Implementation**:
  - The UI explicitly handles 5 core states: *Loading* (calm spinner), *Live Success*, *Stale Data* (explicit banner indicating data age $\ge 90$ mins), *Offline Fallback*, and *Actionable Error with Retry*.
  - No deceptive green ticks appear unless fresh readings verify policy compliance.

---

## 4. Decision 4: Accessible Table Alternative for Temporal Trends (F-04 & U-6)
* **Rationale**: Complex graphic charts often fail accessibility guidelines, clip on 200% font zoom, and are incomprehensible to TalkBack screen readers.
* **Design Implementation**: Alongside visual status cards, the Trends tab provides an accessible structured table view of hourly conditions (Asia/Dhaka timezone). Each row clearly reports time, Heat Index, AQI, and danger thresholds in human language.

---

## 5. Decision 5: Grounded Bilingual Localisation (U-7)
* **Rationale**: Primary school teachers across Bangladesh operate across Bengali and English contexts, while guidelines mix international units (US AQI, °C).
* **Design Implementation**:
  - A prominent one-tap language switch instantly toggles the interface between Bengali and English.
  - Numbers and dates adapt cleanly without layout distortion on 200% display scaling.
