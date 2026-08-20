import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { extractYouTubeId } from '@/lib/youtubeHelpers';

export interface ProMoveResourceContent {
  description: string | null;
  script: string | null;
  audio_url: string | null;
  video_id: string | null;
  links: Array<{ id: string; url: string | null; title: string | null }>;
}

const EMPTY_CONTENT: ProMoveResourceContent = {
  description: null,
  script: null,
  audio_url: null,
  video_id: null,
  links: [],
};

/**
 * Fetches a Pro Move's description + learning-material resources
 * (pro_move_resources: script/audio/video/link). Extracted verbatim from
 * ProMoveDrawer.tsx (MOB-Explore-rebuild) so both the mobile move page
 * (ExploreMove) and the desktop drawer share one fetch implementation.
 *
 * `preloadedDescription` mirrors the tri-state ProMoveDrawer already relied
 * on: pass the move's `description` field through as-is. When it's
 * `undefined` (the caller's data source never selected the column — e.g.
 * useDomainDetail's ProMoveDetail), this hook falls back to a per-move
 * `pro_moves.description` fetch. When it's already a string or explicit
 * `null` (useCraftAtlas selects the column), no extra fetch happens.
 *
 * `enabled` lets a caller defer fetching until it actually needs resources
 * (ProMoveDrawer only wants this while its sheet is open).
 */
export function useProMoveResources(
  actionId: number | null | undefined,
  preloadedDescription: string | null | undefined,
  enabled = true
) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<ProMoveResourceContent>(EMPTY_CONTENT);

  useEffect(() => {
    if (!enabled || !actionId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const descriptionPreloaded = preloadedDescription !== undefined;
      let description: string | null = descriptionPreloaded ? preloadedDescription ?? null : null;

      if (!descriptionPreloaded) {
        const { data: moveData } = await supabase
          .from('pro_moves')
          .select('description')
          .eq('action_id', actionId!)
          .single();
        description = moveData?.description || null;
      }

      const { data: resources } = await supabase
        .from('pro_move_resources')
        .select('*')
        .eq('action_id', actionId!)
        .eq('status', 'active')
        .order('display_order');

      const script = resources?.find((r) => r.type === 'script')?.content_md || null;
      const videoUrl = resources?.find((r) => r.type === 'video')?.url;
      const links =
        resources
          ?.filter((r) => r.type === 'link')
          .map((r) => ({ id: r.id, url: r.url, title: r.title })) || [];

      let audioUrl: string | null = null;
      const audioRes = resources?.find((r) => r.type === 'audio');
      if (audioRes?.url) {
        const { data } = supabase.storage.from('pro-move-audio').getPublicUrl(audioRes.url);
        audioUrl = data.publicUrl;
      }

      if (cancelled) return;
      setContent({
        description,
        script,
        video_id: videoUrl ? extractYouTubeId(videoUrl) : null,
        audio_url: audioUrl,
        links,
      });
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled, actionId, preloadedDescription]);

  return { loading, content };
}
