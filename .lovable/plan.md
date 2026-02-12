

## Doctor Detail Layout + Meeting Prep Summary Redesign

### 1. Header Layout Change (DoctorDetail.tsx)

**Current:** Name + Status Pill on first line, email on second line, then NextActionPanel, then Tabs.

**New:**
- Name + Status Pill on first line
- Location (with MapPin icon) on second line (replacing email)
- Tabs come next
- NextActionPanel moves **below** the TabsList but **above** the TabsContent (inside the Tabs block)

This also means removing the Location Card from `DoctorDetailOverview.tsx` since it's now in the header.

### 2. Meeting Prep as a Dialog (Sheet/Drawer)

Replace the inline `CombinedPrepView` and the scroll-to-section approach with a **Sheet (slide-over panel)** that opens when "View Prep Summary" is clicked. This gives it a dedicated, focused feel without navigating away.

The sheet will contain a redesigned prep summary with:
- **Meeting date and link** at the top
- **Your Agenda** section -- the coach's formatted HTML agenda with `prose` styling
- **Your Pro Move Picks** -- domain-colored badges + action statements
- **Doctor's Pro Move Picks** -- same treatment
- **Doctor's Notes & Questions** -- the doctor's text

Each section uses domain-colored accents for the Pro Move items and clear section headers. If the doctor hasn't submitted yet, a subtle "Waiting for doctor" placeholder appears in those sections.

### Technical Changes

**File: `src/pages/clinical/DoctorDetail.tsx`**
- Remove email line (line 130), replace with location: `<p className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {doctor.locations?.name || 'Roaming'}</p>`
- Move `<DoctorNextActionPanel>` from before `<Tabs>` to inside `<Tabs>`, between `<TabsList>` and the first `<TabsContent>`
- Import `MapPin` from lucide-react

**File: `src/components/clinical/DoctorDetailOverview.tsx`**
- Remove the Location Card entirely (lines 118-127)
- Replace scroll-to-section button with a Sheet trigger
- Import `Sheet, SheetContent, SheetHeader, SheetTitle` from UI
- Add state `showPrepSheet` boolean
- Button opens the sheet; sheet contains the redesigned prep summary
- Remove the inline `CombinedPrepView` render at the bottom (lines 216-227)

**File: `src/components/clinical/CombinedPrepView.tsx`**
- Redesign with better visual hierarchy:
  - Remove the outer meeting-details Card (date/link moves to sheet header)
  - Replace generic "Coach's Prep" / "Doctor's Prep" Cards with cleaner labeled sections
  - Use domain-colored backgrounds on Pro Move items (using `getDomainColor`)
  - Section order: Agenda, Your Picks, Doctor's Picks, Doctor's Notes
  - Add `DomainBadge` component for each Pro Move item
  - Keep `prose` class on agenda HTML for rich formatting
