-- Add audio support to pro_move_resources
ALTER TABLE pro_move_resources 
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Create storage bucket for pro-move audio (public for easy playback)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('pro-move-audio', 'pro-move-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to audio files
CREATE POLICY "Public read access for pro-move audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pro-move-audio');

-- Allow authenticated users (admins) to upload audio
CREATE POLICY "Authenticated users can upload pro-move audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pro-move-audio' AND auth.role() = 'authenticated');

-- Allow authenticated users to update audio
CREATE POLICY "Authenticated users can update pro-move audio"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pro-move-audio' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete audio
CREATE POLICY "Authenticated users can delete pro-move audio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pro-move-audio' AND auth.role() = 'authenticated');