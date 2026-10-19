# Decisions for the council

**Prepared 2026-10-19 · for the USC officers' meeting**

This is the short list of decisions the attendance system needs from the council. Everything else is already
decided or is an implementation detail. Each question below is written to be read aloud, has the options we see,
our recommendation, and — importantly — **the safe default the system runs on until you decide**, so nothing is
blocked while the council considers it.

Write the answer in the box. One answer per question is enough; a "we'll revisit in January" is a perfectly good
answer and the system will keep running on the default.

---

## C-1 · Which authority permits collecting money from an **officer** for absence or lateness?

Monetary fines against a regular student are not granted by law (RA 4206 as amended by RA 5546 limits collecting
contributions from students). Against an officer — someone who accepted the duties of the body — a monetary
sanction is treated as internal discipline, and the system is built to do exactly that. What it needs from the
council is the **citation**: which resolution, by-law, or approving officer authorises it, and from what date.

- **Answer (resolution / by-law / approving officer):** ______________________________________
- **Effective from:** ________________
- **Recommended:** record the citation even if the amount is ₱1 — the point is that the *decision* is on the
  record, and the system refuses to charge money without it.
- **Default until answered:** officer fines are **off**; every absence is recorded as a warning. Nothing is charged.

---

## C-2 · Who handles money, and who checks it?

The system can enforce separation: one person records a payment, another verifies, and anything above an amount
the council sets needs approval. It can also be simpler — one Treasurer recording, everyone else reading.

- **Who records payments?** ______________________________________
- **Who verifies them (if anyone)?** ______________________________________
- **Approval needed above what amount?** ______________________________________
- **Recommended:** Treasurer records; President and Adviser can read everything; a second signature above a
  threshold the council is comfortable with (₱5,000 is a common line).
- **Default until answered:** the Treasurer (or any officer given the finance capability) records; no threshold
  approvals; President and Adviser have read access.

---

## C-3 · How long do records live?

The system can purge on a schedule, but it cannot invent the schedule. The university has one for its own records;
the question is whether the council follows it, and who we ask.

- **Is the council covered by the university's Records Disposition Schedule?** ☐ Yes ☐ No ☐ To ask
- **Who is the university's records officer (name / office)?** ______________________________________
- **Are minutes and resolutions permanent records?** ☐ Yes ☐ No ☐ To ask
- **Recommended:** follow the university's schedule rather than inventing our own, and treat minutes and
  resolutions as permanent.
- **Default until answered:** nothing is deleted except signature images (already on a semester-based schedule);
  everything else is kept.

---

## C-4 · Who is the data controller — the council or the university?

Under the Data Privacy Act, whoever decides *why* and *how* the data is processed is the controller, and the
controller registers the system with the National Privacy Commission within 20 days of it going live. This is
one question with a large tail: the privacy notice, the breach procedure, and who signs as Data Protection
Officer all follow from it.

- **Controller:** ☐ The USC ☐ The university ☐ To confirm with the university
- **Who signs as Data Protection Officer / contact?** ______________________________________
- **Recommended:** raise it with the university's data protection officer in writing, and keep the council's
  notice until they answer.
- **Default until answered:** the council's privacy notice and consent stand; NPC registration waits.

---

## C-5 · Approve the privacy notice and what students are asked to consent to

Students are asked at sign-up, and the notice is versioned — approving it freezes the version we record consent
against, so a later change is a new version, not a quiet edit.

- **Core attendance** (required — without it there is no account): name, student number, course placement,
  attendance records and signatures, fines and clearance.
- **Publication** (optional): the student's name in published minutes, resolutions or the transparency board.
- **Messaging** (optional): email and push beyond the essential kinds (verification, password reset, fine notice,
  clearance issued).

- **Approved?** ☐ Yes, as written ☐ Yes, with changes: ______________________
- **Recommended:** approve as written; keep publication and messaging optional so a student can decline them
  without losing their attendance record.
- **Default until answered:** current wording, recorded as consent version `2026-10`.

---

## C-6 · Location data: how long do we keep the raw coordinates?

When an officer scans a student at the venue, the system checks they are inside the geofence. It stores the
coordinates and the accuracy, plus a flag saying whether they were inside. The flag is what proves presence; the
raw coordinates are only useful if someone disputes a scan.

- **Keep raw coordinates for:** ☐ 7 days ☐ 30 days ☐ one semester ☐ don't keep them at all
- **Recommended:** 30 days — long enough for any dispute to surface, short enough that a semester of student
  movements is not sitting in the database.
- **Default until answered:** coordinates are kept until the dispute window closes, then dropped; the
  inside-the-venue flag and the accuracy are kept.

---

## What happens with these answers

Each answer becomes one line in the system's decision register: the question, the answer, the date, and what
changes. Nothing here is entangled with anything else — answering C-2 in December changes one setting, and the
system starts enforcing it the same day without any rebuild.

| Question | Answered on | Answer recorded by |
|---|---|---|
| C-1 Authority for officer sanctions | | |
| C-2 Money handling and verification | | |
| C-3 Records retention | | |
| C-4 Data controller and DPO | | |
| C-5 Privacy notice and consent purposes | | |
| C-6 Location retention | | |
