import { useState, useEffect } from 'react';
import { GraduationCap, Video, FileText, Link as LinkIcon, X, Volume2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getDomainColor } from '@/lib/domainColors';
import { extractYouTubeId } from '@/lib/youtubeHelpers';


interface LearnerLearnDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionId: number;
  proMoveTitle: string;
  domainName: string;
}

interface Resource {
  id: string;
  type: string;
  url: string | null;
  title: string | null;
  content_md: string | null;
  provider: string | null;
  display_order: number;
}

export function LearnerLearnDrawer({
  open,
  onOpenChange,
  actionId,
  proMoveTitle,
  domainName,
}: LearnerLearnDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [videoResource, setVideoResource] = useState<Resource | null>(null);
  const [scriptResource, setScriptResource] = useState<Resource | null>(null);
  const [audioResource, setAudioResource] = useState<Resource | null>(null);
  const [linkResources, setLinkResources] = useState<Resource[]>([]);

  useEffect(() => {
    if (!open || !actionId) return;
    loadData();
  }, [open, actionId]);

  async function loadData() {
    setLoading(true);
    try {
      // Fetch description from pro_moves
      const { data: pm } = await supabase
        .from('pro_moves')
        .select('description')
        .eq('action_id', actionId)
        .single();

      // Fetch all active resources
      const { data: resources } = await supabase
        .from('pro_move_resources')
        .select('*')
        .eq('action_id', actionId)
        .eq('status', 'active')
        .order('display_order');

      setDescription(pm?.description || '');

      // Find video (prefer lowest display_order)
      const video = resources?.find((r) => r.type === 'video');
      setVideoResource(video || null);

      // Find script
      const script = resources?.find((r) => r.type === 'script');
      setScriptResource(script || null);

      // Find audio (only active status with public URL)
      const audio = resources?.find((r) => r.type === 'audio' && r.status === 'active');
      if (audio) {
        const { data: publicData } = supabase.storage
          .from('pro-move-audio')
          .getPublicUrl(audio.url);
        
        if (publicData?.publicUrl) {
          setAudioResource({
            ...audio,
            url: publicData.publicUrl
          });
        } else {
          setAudioResource(null);
        }
      } else {
        setAudioResource(null);
      }

      // Find all links
      const links = resources?.filter((r) => r.type === 'link') || [];
      setLinkResources(links);
    } catch (error) {
      console.error('Error loading learning resources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load learning resources',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const videoId = videoResource?.url ? extractYouTubeId(videoResource.url) : null;

  // Compute presence flags for conditional rendering
  const hasDescription = Boolean(description);
  const hasScript = Boolean(scriptResource?.content_md);
  const hasAudio = Boolean(audioResource?.url);
  const hasVideo = Boolean(videoId);
  const hasLinks = linkResources.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto overflow-x-hidden">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <SheetTitle>Learning Materials</SheetTitle>
          </div>
          <div className="space-y-2 pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Pro Move</p>
              <p className="text-sm font-medium leading-snug">{proMoveTitle}</p>
            </div>
            <Badge
              variant="secondary"
              style={{
                backgroundColor: `${getDomainColor(domainName)}20`,
                color: getDomainColor(domainName),
                borderColor: getDomainColor(domainName),
              }}
              className="border"
            >
              {domainName}
            </Badge>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6 py-6">
            {/* 1. Why this matters (Description) */}
            {hasDescription && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h3 id="why-matters" className="font-medium">Why this matters</h3>
                </div>
                <p className="text-xs text-muted-foreground italic">30-sec read: what good looks like.</p>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap" aria-labelledby="why-matters">
                  {description}
                </div>
              </section>
            )}

            {/* Divider after description if more sections follow */}
            {hasDescription && (hasScript || hasAudio || hasVideo || hasLinks) && <div className="border-t" />}

            {/* 2. Try saying it like this (Script) */}
            {hasScript && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h3 id="try-saying" className="font-medium">Try saying it like this</h3>
                </div>
                <p className="text-xs text-muted-foreground italic">Use this wording or make it your own.</p>
                <div
                  className="prose prose-sm max-w-none dark:prose-invert prose-pre:whitespace-pre-wrap prose-pre:break-words leading-relaxed"
                  aria-labelledby="try-saying"
                  dangerouslySetInnerHTML={{ __html: scriptResource!.content_md! }}
                />
              </section>
            )}

            {/* Divider after script if more sections follow */}
            {(hasDescription || hasScript) && (hasAudio || hasVideo || hasLinks) && <div className="border-t" />}

            {/* 3. Listen (Audio) */}
            {hasAudio && (
              <section className="space-y-2 pb-2">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h3 className="font-medium">Listen</h3>
                </div>
                <p className="text-xs text-muted-foreground italic">Hear an example.</p>
                <audio
                  controls
                  preload="metadata"
                  src={audioResource!.url!}
                  className="w-full"
                  aria-label="Sample script audio"
                />
              </section>
            )}

            {/* Divider after audio if more sections follow */}
            {(hasDescription || hasScript || hasAudio) && (hasVideo || hasLinks) && <div className="border-t" />}

            {/* 4. Video */}
            {hasVideo && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h3 className="font-medium">Video</h3>
                </div>
                <div className="relative w-full aspect-video">
                  <iframe
                    className="absolute inset-0 w-full h-full rounded-lg"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="Learning video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </section>
            )}

            {/* Divider after video if links follow */}
            {(hasDescription || hasScript || hasAudio || hasVideo) && hasLinks && <div className="border-t" />}

            {/* 5. Additional Links */}
            {hasLinks && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h3 className="font-medium">Additional Links</h3>
                </div>
                <div className="space-y-2">
                  {linkResources.map((link) => (
                    <Button
                      key={link.id}
                      variant="outline"
                      className="w-full justify-start p-3 h-auto"
                      asChild
                    >
                      <a
                        href={link.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <div className="flex items-center gap-2 w-full min-w-0">
                          <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                          <div className="min-w-0 text-left flex-1">
                            {link.title && (
                              <p className="font-medium text-sm truncate">{link.title}</p>
                            )}
                            <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                          </div>
                        </div>
                      </a>
                    </Button>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {!hasDescription && !hasScript && !hasAudio && !hasVideo && !hasLinks && (
              <div className="text-center py-12 text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No learning materials available yet.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
