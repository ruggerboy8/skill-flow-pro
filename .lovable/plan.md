
# Clinical Pro-Move Library with AI-Assisted Content Generation

## Summary

This plan builds a bespoke Clinical Pro-Move Library at `/clinical/pro-moves` with two major enhancements:
1. A proper doctor-specific learning materials editor that handles all doctor resource types
2. AI-powered content categorization that takes free-form voice or text input and automatically structures it into the required categories

---

## 1. Current State Analysis

### What's Working
- Doctor Pro Moves exist (role_id = 4) with action_ids 4001-4003
- Doctor resources are being stored with types: `doctor_why`, `doctor_script`, `doctor_good_looks_like`
- The read-only `DoctorMaterialsSheet` correctly displays these fields

### What's Missing
- Route `/clinical/pro-moves` not registered in App.tsx
- No dedicated editing UI for doctor-specific resource fields
- `doctor_gut_check` content is not populated
- No AI assistance for content generation

---

## 2. Route Registration

Add the missing route to App.tsx:

```text
/clinical/pro-moves     -> DoctorProMoveLibrary (new page)
```

---

## 3. Bespoke Clinical Pro-Move Library Page

### 3.1 Page Structure (`src/pages/clinical/DoctorProMoveLibrary.tsx`)

A simplified, doctor-focused version of ProMoveLibrary:
- Auto-filtered to role_id = 4 (Doctor) only
- No role dropdown (fixed to Doctor)
- Competency filter for doctor competencies
- Search functionality
- Add/Edit Pro Move dialog (reuse ProMoveForm with role locked)
- Doctor Materials Drawer for editing learning content

### 3.2 Pro Move List Display
- Table or card grid of doctor pro moves
- Each row shows: Pro Move statement, Competency, Domain, Content Status badges
- Content status indicators:
  - "Why" checkmark/X
  - "Script" checkmark/X
  - "Gut Check" checkmark/X
  - "Good Looks Like" checkmark/X
- Click row to open the Doctor Materials Drawer

---

## 4. Doctor Materials Drawer (Edit Mode)

### 4.1 New Component: `DoctorMaterialsDrawer.tsx`

A Sheet/Drawer for editing doctor-specific learning materials:

```text
+--------------------------------------------------+
| Learning Materials: [Pro Move Statement]         |
+--------------------------------------------------+
| Why It Matters                                   |
| [Textarea - markdown supported]                  |
|                                                  |
| Scripting                                        |
| [Textarea - markdown supported]                  |
|                                                  |
| Gut Check Questions                              |
| [Textarea - markdown supported]                  |
|                                                  |
| What Good Looks Like                             |
| [Textarea - markdown supported]                  |
+--------------------------------------------------+
| [AI Assist] Input plain-language instructions... |
+--------------------------------------------------+
|                          [Cancel]  [Save All]    |
+--------------------------------------------------+
```

### 4.2 Data Flow
- On open: Fetch all `pro_move_resources` where `action_id = X` and `type IN (doctor_why, doctor_script, doctor_gut_check, doctor_good_looks_like)`
- On save: Upsert each resource type individually

---

## 5. AI-Assisted Content Generation

### 5.1 UX Concept

Dr. Alex can provide free-form input (voice or text) describing the pro move's importance, scripting examples, and expectations. The AI categorizes this into the four required fields.

**Input Methods:**
1. **Text Box**: Large textarea for typing/pasting instructions
2. **Voice Recording**: Use existing `useAudioRecording` hook + transcription pipeline

**Output:**
- AI returns structured content mapped to:
  - `doctor_why`
  - `doctor_script`
  - `doctor_gut_check`
  - `doctor_good_looks_like`

### 5.2 AI Input Panel

Located at the bottom of the drawer or as a collapsible section:

```text
+--------------------------------------------------+
| AI Content Assistant                             |
+--------------------------------------------------+
| Describe what you want doctors to understand...  |
| [Large textarea for free-form input]             |
|                                                  |
| OR                                               |
|                                                  |
| [🎤 Record Voice] [00:00]                        |
+--------------------------------------------------+
| [Generate Content]                               |
+--------------------------------------------------+
```

### 5.3 Edge Function: `categorize-doctor-content`

New edge function that takes raw input and returns structured content:

**Request:**
```json
{
  "proMoveStatement": "I always chart existing findings...",
  "rawInput": "The reason this matters is because we need accurate baseline records. When you're with a patient, you should say things like 'Calling out existing crown on A...' The key gut check is: Did I verbally announce all existing findings? Good looks like when you see the chart has complete baseline before new findings."
}
```

**Response:**
```json
{
  "doctor_why": "An accurate baseline prevents confusion...",
  "doctor_script": "\"Calling out existing stainless steel crown on A...\"",
  "doctor_gut_check": "- Did I verbally announce all existing findings?\n- Is the baseline complete before documenting new disease?",
  "doctor_good_looks_like": "- Review all radiographs and clinical findings\n- Verbally call out existing restorations..."
}
```

### 5.4 AI Prompt Design

System prompt for categorization:

```text
You are an expert Dental Clinical Coach helping structure professional development content for doctors.

Given a Pro Move statement and free-form instructions, categorize the content into four required fields:

1. **Why It Matters** (doctor_why): 2-4 sentences explaining the importance and impact of this behavior. Focus on patient safety, accuracy, and team efficiency.

2. **Scripting** (doctor_script): Specific phrases or dialogue the doctor should use. Format as quoted examples. If multiple examples, use bullet points with quotes.

3. **Gut Check Questions** (doctor_gut_check): 2-4 self-reflection questions the doctor can ask themselves to verify they're doing this correctly. Format as a markdown bulleted list starting each with "Did I..." or similar question format.

4. **What Good Looks Like** (doctor_good_looks_like): Observable behaviors or outcomes that indicate mastery. Format as a markdown bulleted list of concrete, observable actions.

Output JSON with keys: doctor_why, doctor_script, doctor_gut_check, doctor_good_looks_like
Each value should be well-formatted markdown.
```

### 5.5 Voice Recording Flow

1. User clicks "Record Voice"
2. Audio is captured using `useAudioRecording`
3. On stop, audio is transcribed using existing `transcribe-audio` edge function
4. Transcription is passed to `categorize-doctor-content`
5. Results populate the four fields (user can review/edit before saving)

---

## 6. Main Pro Move Library Enhancement

### 6.1 Conditional Doctor Materials Button

In the existing `ProMoveList`, when viewing a Doctor pro move (role_id = 4):
- Show a dedicated "Doctor Materials" button that opens `DoctorMaterialsDrawer`
- Or: detect role_id in LearningDrawer and switch to doctor-specific fields

### 6.2 Alternative: Detect in LearningDrawer

Modify `LearningDrawer.tsx` to:
1. Accept a `roleId` prop
2. If `roleId === 4`, show doctor-specific sections instead of video/script/audio/links
3. Include the AI Assistant panel

This is more maintainable than creating a completely separate drawer.

---

## 7. File Structure

### 7.1 New Files

```text
src/pages/clinical/
  DoctorProMoveLibrary.tsx       # Bespoke doctor pro move management

src/components/clinical/
  DoctorMaterialsDrawer.tsx      # Edit drawer for doctor resources
  AIContentAssistant.tsx         # Voice/text input + AI categorization UI

supabase/functions/
  categorize-doctor-content/
    index.ts                     # AI categorization edge function
```

### 7.2 Modified Files

```text
src/App.tsx                      # Add /clinical/pro-moves route
src/components/admin/LearningDrawer.tsx  # Optional: detect doctor role
```

---

## 8. Implementation Sequence

### Phase A: Route and Basic Page
1. Register `/clinical/pro-moves` route in App.tsx
2. Create `DoctorProMoveLibrary.tsx` with:
   - Auto-filtered pro move list for role_id = 4
   - Add/Edit dialog (reusing ProMoveForm with locked role)
   - Basic content status indicators

### Phase B: Doctor Materials Drawer
1. Create `DoctorMaterialsDrawer.tsx` with:
   - Four markdown textareas for doctor resource types
   - Load/save logic for `pro_move_resources` table
   - Dirty state tracking and unsaved changes dialog

### Phase C: AI Content Assistant
1. Create `categorize-doctor-content` edge function:
   - Accept raw input + pro move statement
   - Call Lovable AI (gemini-2.5-flash) with tool calling
   - Return structured JSON with four fields
2. Create `AIContentAssistant.tsx` component:
   - Text input mode
   - Voice recording mode (using existing hooks)
   - Transcription integration
   - "Generate" button that calls edge function
   - Populate fields with AI response

### Phase D: Integration
1. Wire AI Assistant into DoctorMaterialsDrawer
2. Add preview/review step before accepting AI suggestions
3. Test full flow: voice -> transcription -> categorization -> save

---

## 9. Technical Notes

### Edge Function Tool Calling Pattern
Following the existing `extract-insights` pattern:

```typescript
const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${LOVABLE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "google/gemini-2.5-flash",
    messages: [...],
    tools: [{
      type: "function",
      function: {
        name: "categorize_content",
        parameters: {
          type: "object",
          properties: {
            doctor_why: { type: "string" },
            doctor_script: { type: "string" },
            doctor_gut_check: { type: "string" },
            doctor_good_looks_like: { type: "string" }
          },
          required: [...]
        }
      }
    }],
    tool_choice: { type: "function", function: { name: "categorize_content" } }
  })
});
```

### Transcription Integration
Reuse the existing transcription pipeline:
1. Record audio -> get Blob
2. Call `transcribe-audio` edge function
3. Get transcript text
4. Pass to `categorize-doctor-content`

### Resource Upsert Logic
For each resource type:
```typescript
// Check if exists
const existing = await supabase
  .from('pro_move_resources')
  .select('id')
  .eq('action_id', actionId)
  .eq('type', 'doctor_why')
  .maybeSingle();

if (existing) {
  // Update
  await supabase.from('pro_move_resources')
    .update({ content_md: value })
    .eq('id', existing.id);
} else if (value) {
  // Insert
  await supabase.from('pro_move_resources')
    .insert({ action_id, type: 'doctor_why', content_md: value });
}
```

---

## 10. UI/UX Considerations

### AI-Generated Content Review
- Show AI-generated content in a "preview" state with light yellow background
- User must click "Accept" or edit before saving
- Clear indication that content came from AI

### Voice Recording Feedback
- Show waveform or recording indicator
- Display transcription in progress state
- Show categorization in progress state

### Error Handling
- Transcription failures: Show retry button
- AI categorization failures: Show error message, allow manual entry
- Save failures: Keep form data, show error toast
