-- Create storage bucket for evaluation recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('evaluation-recordings', 'evaluation-recordings', false);

-- Create RLS policies for the bucket
CREATE POLICY "Coaches can upload recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'evaluation-recordings' 
  AND is_coach_or_admin(auth.uid())
);

CREATE POLICY "Coaches can view recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'evaluation-recordings' 
  AND is_coach_or_admin(auth.uid())
);

CREATE POLICY "Coaches can update recordings"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'evaluation-recordings' 
  AND is_coach_or_admin(auth.uid())
);

CREATE POLICY "Coaches can delete recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'evaluation-recordings' 
  AND is_coach_or_admin(auth.uid())
);

-- Add audio_recording_path column to evaluations table
ALTER TABLE public.evaluations
ADD COLUMN audio_recording_path TEXT;

COMMENT ON COLUMN public.evaluations.audio_recording_path IS 'Storage path for self-evaluation interview audio recording';