

# Add practice_types to the Pro Move Library Template Download

## Problem
The "Template" download button in the Admin Pro Move Library generates a CSV inline (lines 100-116 of `ProMoveLibrary.tsx`) that is missing the `practice_types` column. The static file `public/pro-moves-template.csv` has it with full documentation, but the download button doesn't use that file.

## Solution
Replace the inline CSV generation in `ProMoveLibrary.tsx` `downloadTemplate()` with a redirect to the static template file (`/pro-moves-template.csv`), which already includes `practice_types` with pipe-delimited format documentation, valid values, and examples.

## Technical Details

### File: `src/components/admin/ProMoveLibrary.tsx`
- Replace the `downloadTemplate()` function body (lines 100-117) to fetch and download `/pro-moves-template.csv` directly instead of generating CSV inline
- Simple approach: change to `window.open('/pro-moves-template.csv', '_blank')` or use an anchor download pointing to the static file

### Verification
- The static template at `public/pro-moves-template.csv` already includes:
  - `practice_types` column with pipe-delimited format
  - Valid values: `pediatric_us`, `general_us`, `general_uk`
  - Comment header explaining the format
  - Example rows showing single and multi-type entries

This is a one-line fix.

