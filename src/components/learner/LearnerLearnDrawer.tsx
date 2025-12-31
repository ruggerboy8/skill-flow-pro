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

interface LearnerLearnDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionId: number;
  proMoveTitle: string;
  domainName: string;
  lastPracticed?: string | null;
  avgConfidence?: number | null;
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
  lastPracticed,
  avgConfidence,
}: LearnerLearnDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [videoResource, setVideoResource] = useState<Resource | null>(null);
  const [scriptResource, setScriptResource] = useState<Resource | null>(null);
  const [audioResource, setAudioResource] = useState<Resource | null>(null);
  const [linkResources, setLinkResources] = useState<Resource[]>([]);

  const richColor = getDomainColorRichRaw(domainName);

  useEffect(() => {
    if (!open || !actionId) return;
    loadData();
  }, [open, actionId]);

  async function loadData() {
    setLoading(true);
    try {
      // Fetch description from pro_moves
      const { data: pm } = await supabase.from("pro_moves").select("description").eq("action_id", actionId).single();

      // Fetch all active resources
      const { data: resources } = await supabase
        .from("pro_move_resources")
        .select("*")
        .eq("action_id", actionId)
        .eq("status", "active")
        .order("display_order");

      setDescription(pm?.description || "");

      // Find video (prefer lowest display_order)
      const video = resources?.find((r) => r.type === "video");
      setVideoResource(video || null);

      // Find script
      const script = resources?.find((r) => r.type === "script");
      setScriptResource(script || null);

      // Find audio (only active status with public URL)
      const audio = resources?.find((r) => r.type === "audio" && r.status === "active");
      if (audio) {
        const { data: publicData } = supabase.storage.from("pro-move-audio").getPublicUrl(audio.url);

        if (publicData?.publicUrl) {
          setAudioResource({
            ...audio,
            url: publicData.publicUrl,
          });
        } else {
          setAudioResource(null);
        }
      } else {
        setAudioResource(null);
      }

      // Find all links
      const links = resources?.filter((r) => r.type === "link") || [];
      setLinkResources(links);
    } catch (error) {
      console.error("Error loading learning resources:", error);
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
  const hasContent = hasDescription || hasScript || hasAudio || hasVideo || hasLinks;

  // Section header helper matching ProMoveDrawer
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[540px] h-[100dvh] p-0 flex flex-col gap-0 border-l-0 sm:border-l">
        {/* Header with domain color background */}
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
            {proMoveTitle}
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
                {hasDescription && (
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {description}
                  </div>
                )}

                {/* Script */}
                {hasScript && (
                  <section>
                    <SectionHeader icon={MessageCircle} title="Suggested Verbiage" />
                    <div 
                      className="text-base md:text-lg leading-relaxed p-4 md:p-5 rounded-2xl border-2 border-dashed"
                      style={{ 
                        backgroundColor: `hsl(${richColor} / 0.03)`,
                        borderColor: `hsl(${richColor} / 0.2)` 
                      }}
                    >
                      "{scriptResource!.content_md}"
                    </div>
                  </section>
                )}

                {/* Audio */}
                {hasAudio && (
                  <section>
                    <SectionHeader icon={PlayCircle} title="Listen" />
                    <div className="p-1 rounded-full border bg-muted/20">
                      <audio 
                        controls 
                        src={audioResource!.url!} 
                        className="w-full h-10" 
                        style={{ borderRadius: "9999px" }} 
                      />
                    </div>
                  </section>
                )}

                {/* Video */}
                {hasVideo && (
                  <section>
                    <SectionHeader icon={Video} title="Watch" />
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden border bg-black shadow-sm">
                      <iframe
                        className="absolute inset-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title="Learning video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </section>
                )}

                {/* Additional Links */}
                {hasLinks && (
                  <section>
                    <SectionHeader icon={LinkIcon} title="Resources" />
                    <div className="space-y-2">
                      {linkResources.map(link => (
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
                        {lastPracticed 
                          ? new Date(lastPracticed).toLocaleDateString() 
                          : "Not yet"}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/10 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <CheckCircle2 className="w-3 h-3" /> Avg Confidence
                      </div>
                      <p className="font-semibold text-sm">
                        {avgConfidence 
                          ? `${avgConfidence.toFixed(1)} / 4` 
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
