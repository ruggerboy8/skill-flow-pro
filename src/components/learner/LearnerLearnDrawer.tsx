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

      // Fetch all published resources
      const { data: resources } = await supabase
        .from('pro_move_resources')
        .select('*')
        .eq('action_id', actionId)
        .eq('status', 'published')
        .order('display_order');

      setDescription(pm?.description || '');

      // Find video (prefer lowest display_order)
      const video = resources?.find((r) => r.type === 'video');
      setVideoResource(video || null);

      // Find script
      const script = resources?.find((r) => r.type === 'script');
      setScriptResource(script || null);

      // Find audio
      const audio = resources?.find((r) => r.type === 'audio');
      setAudioResource(audio || null);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
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
            {/* Description Section */}
            {description && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium">Description</h3>
                </div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {description}
                </div>
              </section>
            )}

            {/* Video Section */}
            {videoId && (
              <>
                {description && <div className="border-t" />}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Video</h3>
                  </div>
                  <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                    <iframe
                      className="absolute top-0 left-0 w-full h-full rounded-lg"
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title="YouTube video"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </section>
              </>
            )}

            {/* Script Section */}
            {scriptResource?.content_md && (
              <>
                {(description || videoId) && <div className="border-t" />}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Script</h3>
                  </div>
                  <div 
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: scriptResource.content_md }}
                  />
                </section>
              </>
            )}

            {/* Audio Section */}
            {audioResource?.url && (
              <>
                {(description || videoId || scriptResource?.content_md) && <div className="border-t" />}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">Audio Narration</h3>
                  </div>
                  <audio 
                    controls 
                    preload="metadata" 
                    src={audioResource.url}
                    className="w-full"
                  />
                </section>
              </>
            )}

            {/* Links Section */}
            {linkResources.length > 0 && (
              <>
                {(description || videoId || scriptResource?.content_md || audioResource?.url) && <div className="border-t" />}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
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
                          <div className="flex items-center gap-2 w-full">
                            <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0 text-left">
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
              </>
            )}

            {/* Empty state */}
            {!description && !videoId && !scriptResource?.content_md && !audioResource?.url && linkResources.length === 0 && (
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
