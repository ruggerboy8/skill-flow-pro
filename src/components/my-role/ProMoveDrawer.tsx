import { useState, useEffect } from "react";
import { GraduationCap, Video, MessageCircle, Link as LinkIcon, PlayCircle, Clock, CheckCircle2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getDomainColorRichRaw } from "@/lib/domainColors";
import { extractYouTubeId } from "@/lib/youtubeHelpers";
import type { ProMoveDetail } from "@/hooks/useDomainDetail";

interface ProMoveDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  move: ProMoveDetail | null;
  domainName: string;
}

interface ContentState {
  description: string | null;
  script: string | null;
  audio_url: string | null;
  video_id: string | null;
  links: Array<{ id: string; url: string | null; title: string | null }>;
}

export function ProMoveDrawer({
  open,
  onOpenChange,
  move,
  domainName,
}: ProMoveDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<ContentState>({
    description: null,
    script: null,
    audio_url: null,
    video_id: null,
    links: []
  });

  const richColor = getDomainColorRichRaw(domainName);

  useEffect(() => {
    if (!open || !move?.action_id) return;
    
    async function loadResources() {
      setLoading(true);
      
      // 1. Fetch description from pro_moves
      const { data: moveData } = await supabase
        .from('pro_moves')
        .select('description')
        .eq('action_id', move!.action_id)
        .single();

      // 2. Fetch Resources
      const { data: resources } = await supabase
        .from('pro_move_resources')
        .select('*')
        .eq('action_id', move!.action_id)
        .eq('status', 'active')
        .order('display_order');

      // Process Resources
      const script = resources?.find(r => r.type === 'script')?.content_md || null;
      const videoUrl = resources?.find(r => r.type === 'video')?.url;
      const links = resources?.filter(r => r.type === 'link').map(r => ({
        id: r.id,
        url: r.url,
        title: r.title
      })) || [];
      
      let audioUrl = null;
      const audioRes = resources?.find(r => r.type === 'audio');
      if (audioRes?.url) {
        const { data } = supabase.storage.from('pro-move-audio').getPublicUrl(audioRes.url);
        audioUrl = data.publicUrl;
      }

      setContent({
        description: moveData?.description || null,
        script,
        video_id: videoUrl ? extractYouTubeId(videoUrl) : null,
        audio_url: audioUrl,
        links
      });
      setLoading(false);
    }

    loadResources();
  }, [open, move?.action_id]);

  if (!move) return null;

  // Helper for section headers
  const SectionHeader = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
    <div className="flex items-center gap-2 mb-3 mt-6">
      <div 
        className="p-1.5 rounded-md" 
        style={{ backgroundColor: `hsl(${richColor} / 0.1)` }}
      >
        <Icon className="h-4 w-4" style={{ color: `hsl(${richColor})` }} />
      </div>
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
    </div>
  );

  const hasContent = content.description || content.script || content.audio_url || content.video_id || content.links.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[540px] p-0 flex flex-col gap-0 border-l-0 sm:border-l">
        {/* Header */}
        <SheetHeader 
          className="px-6 py-6 text-left border-b"
          style={{ backgroundColor: `hsl(${richColor} / 0.08)` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Badge 
              variant="outline" 
              className="bg-background/50 backdrop-blur text-xs font-normal"
              style={{ 
                color: `hsl(${richColor})`,
                borderColor: `hsl(${richColor} / 0.3)`
              }}
            >
              {domainName}
            </Badge>
          </div>
          <SheetTitle className="text-xl md:text-2xl font-bold leading-tight">
            {move.action_statement}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground flex items-center gap-1">
            <GraduationCap className="w-3 h-3" />
            Study Mode
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="py-6 space-y-1">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-24 w-full mt-6" />
              </div>
            ) : !hasContent ? (
              <div className="text-center py-12 text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No learning materials available yet.</p>
              </div>
            ) : (
              <>
                {/* Description (The Why) */}
                {content.description && (
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {content.description}
                  </div>
                )}

                {/* Script */}
                {content.script && (
                  <section>
                    <SectionHeader icon={MessageCircle} title="Suggested Verbiage" />
                    <div 
                      className="text-base leading-relaxed p-5 rounded-2xl border-2 border-dashed"
                      style={{ 
                        backgroundColor: `hsl(${richColor} / 0.03)`,
                        borderColor: `hsl(${richColor} / 0.2)` 
                      }}
                    >
                      <span className="absolute -top-3 left-4 px-2 bg-background text-xs text-muted-foreground font-medium">
                        Script
                      </span>
                      "{content.script}"
                    </div>
                  </section>
                )}

                {/* Audio */}
                {content.audio_url && (
                  <section>
                    <SectionHeader icon={PlayCircle} title="Listen" />
                    <div className="p-1 rounded-full border bg-muted/20">
                      <audio 
                        controls 
                        src={content.audio_url} 
                        className="w-full h-10" 
                        style={{ borderRadius: "9999px" }} 
                      />
                    </div>
                  </section>
                )}

                {/* Video */}
                {content.video_id && (
                  <section>
                    <SectionHeader icon={Video} title="Watch" />
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden border bg-black shadow-sm">
                      <iframe
                        className="absolute inset-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${content.video_id}`}
                        title="Learning video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </section>
                )}

                {/* Additional Links */}
                {content.links.length > 0 && (
                  <section>
                    <SectionHeader icon={LinkIcon} title="Resources" />
                    <div className="space-y-2">
                      {content.links.map(link => (
                        <Button 
                          key={link.id} 
                          variant="outline" 
                          className="w-full justify-start" 
                          asChild
                        >
                          <a href={link.url || '#'} target="_blank" rel="noreferrer">
                            <LinkIcon className="mr-2 h-4 w-4" /> 
                            {link.title || 'View Resource'}
                          </a>
                        </Button>
                      ))}
                    </div>
                  </section>
                )}

                {/* User Stats Footer */}
                <div className="pt-8 mt-8 border-t">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-4">
                    Your History
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border bg-muted/10 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Clock className="w-3 h-3" /> Last Practiced
                      </div>
                      <p className="font-semibold text-sm">
                        {move.lastPracticed 
                          ? new Date(move.lastPracticed).toLocaleDateString() 
                          : "Not yet"}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/10 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <CheckCircle2 className="w-3 h-3" /> Avg Confidence
                      </div>
                      <p className="font-semibold text-sm">
                        {move.avgConfidence 
                          ? `${move.avgConfidence.toFixed(1)} / 4` 
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-background">
          <Button onClick={() => onOpenChange(false)} className="w-full" variant="outline">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
