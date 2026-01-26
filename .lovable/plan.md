
# Office Manager Competency Database Update

## Overview
Update the `competencies` table with the 16 finalized Office Manager competencies, including new titles (name), taglines, and friendly descriptions.

## Database Changes Required

### Step 1: Identify Existing OM Competency Records
Query the `competencies` table for `role_id = 3` (Office Manager) to get the current competency IDs that need updating.

### Step 2: Update Each Competency Record
For each of the 16 competencies, update:
- `name` → New concise title
- `tagline` → Short italicized phrase
- `friendly_description` → Coach-voice supportive text

### SQL Updates (to be executed via insert tool)

```sql
-- Clinical Domain (domain_id = 1)
UPDATE competencies SET 
  name = 'Quality Through Feedback',
  tagline = 'Hear parents, fix systems',
  friendly_description = 'You connect the dots between what parents say, what you observe, and what needs to change—keeping the clinical team aligned on what matters most.'
WHERE role_id = 3 AND name LIKE '%Quality%' OR name LIKE '%Clinical Quality%';

-- Repeat for all 16 competencies...
```

### Mapping by Domain

**Clinical (domain_id = 1)**
1. Quality Through Feedback
2. Team Training Oversight  
3. Patient Care Standards
4. Compliance and Safety

**Clerical (domain_id = 2)**
5. Operational Efficiency
6. Schedule and Flow
7. Root Cause Analysis
8. Revenue Cycle Management

**Cultural (domain_id = 3)**
9. Leading and Coaching
10. Trust Building
11. Emotional Intelligence
12. Community and Marketing

**Case Acceptance (domain_id = 4)**
13. Case Communication
14. Financial Coordination
15. Treatment Plan Follow-Up
16. Patient Experience

## Technical Notes
- The `description` field (original formal text) can be preserved or updated separately
- Changes will immediately reflect in the "My Role" domain detail pages for Office Managers
- No code changes required—the `useDomainDetail` hook already pulls `name`, `tagline`, and `friendly_description`

## Next Steps
1. Query existing OM competency records to get exact IDs
2. Execute UPDATE statements via the insert tool
3. Verify changes appear correctly in the My Role UI
