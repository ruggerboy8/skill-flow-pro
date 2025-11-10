import { useState, useEffect } from 'react';
import { GraduationCap, Video, FileText, Link as LinkIcon, Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { YouTubePreview } from './YouTubePreview';
import { MarkdownPreview } from './MarkdownPreview';
import { LinkEditor } from './LinkEditor';
import { DraggableList } from './DraggableList';
import { extractYouTubeId, isValidYouTubeUrl } from '@/lib/youtubeHelpers';

interface LearningDrawerProps {
  actionId: number;
  proMoveTitle: string;
  domainName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface LinkResource {
  id?: string;
  url: string;
  title?: string;
  display_order: number;
}

export function LearningDrawer({
  actionId,
  proMoveTitle,
  domainName,
  open,
  onOpenChange,
  onSaved,
}: LearningDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoResourceId, setVideoResourceId] = useState<string>();
  const [script, setScript] = useState('');
  const [scriptResourceId, setScriptResourceId] = useState<string>();
  const [links, setLinks] = useState<LinkResource[]>([]);
  const [editingLink, setEditingLink] = useState<LinkResource | null>(null);
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [videoError, setVideoError] = useState<string>();

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

      // Fetch all resources
      const { data: resources } = await supabase
        .from('pro_move_resources')
        .select('*')
        .eq('action_id', actionId)
        .order('display_order');

      setDescription(pm?.description || '');

      const video = resources?.find((r) => r.type === 'video');
      if (video) {
        setVideoUrl(video.url || '');
        setVideoId(extractYouTubeId(video.url || ''));
        setVideoResourceId(video.id);
      }

      const scriptRes = resources?.find((r) => r.type === 'script');
      if (scriptRes) {
        setScript(scriptRes.content_md || '');
        setScriptResourceId(scriptRes.id);
      }

      const linkResources = resources?.filter((r) => r.type === 'link') || [];
      setLinks(
        linkResources.map((r) => ({
          id: r.id,
          url: r.url || '',
          title: r.title || undefined,
          display_order: r.display_order,
        }))
      );
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

  async function saveDescription() {
    try {
      await supabase
        .from('pro_moves')
        .update({ description })
        .eq('action_id', actionId);
      
      toast({
        title: 'Success',
        description: 'Description saved',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save description',
        variant: 'destructive',
      });
    }
  }

  async function saveVideo() {
    setVideoError(undefined);
    
    if (!videoUrl.trim()) {
      // Delete video if URL is empty
      if (videoResourceId) {
        try {
          await supabase
            .from('pro_move_resources')
            .delete()
            .eq('id', videoResourceId);
          
          setVideoResourceId(undefined);
          setVideoId(null);
          
          toast({
            title: 'Success',
            description: 'Video removed',
          });
        } catch (error) {
          toast({
            title: 'Error',
            description: 'Failed to remove video',
            variant: 'destructive',
          });
        }
      }
      return;
    }

    const extractedId = extractYouTubeId(videoUrl);
    if (!extractedId) {
      setVideoError('Invalid YouTube URL. Please use a valid YouTube link.');
      return;
    }

    try {
      // Delete existing video first
      if (videoResourceId) {
        await supabase
          .from('pro_move_resources')
          .delete()
          .eq('id', videoResourceId);
      } else {
        // Delete any other video for this action (safety)
        await supabase
          .from('pro_move_resources')
          .delete()
          .eq('action_id', actionId)
          .eq('type', 'video');
      }

      // Insert new video
      const { data } = await supabase
        .from('pro_move_resources')
        .insert({
          action_id: actionId,
          type: 'video',
          provider: 'youtube',
          url: videoUrl,
          display_order: 0,
        })
        .select()
        .single();

      setVideoId(extractedId);
      setVideoResourceId(data?.id);

      toast({
        title: 'Success',
        description: 'Video saved',
      });
      
      onSaved?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save video',
        variant: 'destructive',
      });
    }
  }

  async function saveScript() {
    try {
      if (!script.trim()) {
        // Delete script if empty
        if (scriptResourceId) {
          await supabase
            .from('pro_move_resources')
            .delete()
            .eq('id', scriptResourceId);
          
          setScriptResourceId(undefined);
        }
        
        toast({
          title: 'Success',
          description: 'Script removed',
        });
        return;
      }

      if (scriptResourceId) {
        // Update existing
        await supabase
          .from('pro_move_resources')
          .update({ content_md: script })
          .eq('id', scriptResourceId);
      } else {
        // Insert new
        const { data } = await supabase
          .from('pro_move_resources')
          .insert({
            action_id: actionId,
            type: 'script',
            content_md: script,
            display_order: 1,
          })
          .select()
          .single();
        
        setScriptResourceId(data?.id);
      }

      toast({
        title: 'Success',
        description: 'Script saved',
      });
      
      onSaved?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save script',
        variant: 'destructive',
      });
    }
  }

  function handleAddLink() {
    setEditingLink(null);
    setShowLinkEditor(true);
  }

  function handleEditLink(link: LinkResource) {
    setEditingLink(link);
    setShowLinkEditor(true);
  }

  async function handleSaveLink(link: { id?: string; url: string; title?: string }) {
    try {
      if (link.id) {
        // Update existing
        await supabase
          .from('pro_move_resources')
          .update({ url: link.url, title: link.title })
          .eq('id', link.id);
        
        setLinks((prev) =>
          prev.map((l) => (l.id === link.id ? { ...l, url: link.url, title: link.title } : l))
        );
      } else {
        // Insert new
        const { data } = await supabase
          .from('pro_move_resources')
          .insert({
            action_id: actionId,
            type: 'link',
            url: link.url,
            title: link.title,
            display_order: links.length + 10,
          })
          .select()
          .single();
        
        if (data) {
          setLinks((prev) => [
            ...prev,
            { id: data.id, url: link.url, title: link.title, display_order: links.length + 10 },
          ]);
        }
      }

      setShowLinkEditor(false);
      setEditingLink(null);
      
      toast({
        title: 'Success',
        description: 'Link saved',
      });
      
      onSaved?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save link',
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteLink(link: LinkResource) {
    if (!link.id) return;

    try {
      await supabase
        .from('pro_move_resources')
        .delete()
        .eq('id', link.id);

      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      
      toast({
        title: 'Success',
        description: 'Link deleted',
      });
      
      onSaved?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete link',
        variant: 'destructive',
      });
    }
  }

  async function handleReorderLinks(reorderedLinks: LinkResource[]) {
    setLinks(reorderedLinks);

    try {
      // Update display_order for all links
      const updates = reorderedLinks.map((link, index) => 
        supabase
          .from('pro_move_resources')
          .update({ display_order: index + 10 })
          .eq('id', link.id!)
      );

      await Promise.all(updates);
      
      onSaved?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reorder links',
        variant: 'destructive',
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <SheetTitle>Learning Materials</SheetTitle>
          </div>
          <div className="space-y-1 pt-2">
            <p className="text-sm font-medium">{proMoveTitle}</p>
            <Badge variant="secondary">{domainName}</Badge>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6 py-6">
            {/* Description Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Description</h3>
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this pro-move..."
                className="min-h-[100px]"
              />
              <Button onClick={saveDescription} size="sm">
                Save Description
              </Button>
            </section>

            <Separator />

            {/* Video Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Video (YouTube)</h3>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="video-url">YouTube URL</Label>
                <Input
                  id="video-url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className={videoError ? 'border-destructive' : ''}
                />
                {videoError && <p className="text-sm text-destructive">{videoError}</p>}
              </div>

              {videoId && <YouTubePreview videoId={videoId} />}

              <div className="flex gap-2">
                <Button onClick={saveVideo} size="sm">
                  Save Video
                </Button>
                {videoResourceId && (
                  <Button
                    onClick={() => {
                      setVideoUrl('');
                      saveVideo();
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </section>

            <Separator />

            {/* Script Section */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium">Script</h3>
              </div>
              
              <MarkdownPreview value={script} onChange={setScript} />

              <div className="flex gap-2">
                <Button onClick={saveScript} size="sm">
                  Save Script
                </Button>
                {scriptResourceId && script && (
                  <Button
                    onClick={() => {
                      setScript('');
                      saveScript();
                    }}
                    variant="outline"
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </section>

            <Separator />

            {/* Links Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-medium">Additional Links</h3>
                </div>
                <Button onClick={handleAddLink} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Link
                </Button>
              </div>

              {showLinkEditor && (
                <LinkEditor
                  link={editingLink || undefined}
                  onSave={handleSaveLink}
                  onCancel={() => {
                    setShowLinkEditor(false);
                    setEditingLink(null);
                  }}
                />
              )}

              <DraggableList
                items={links}
                onReorder={handleReorderLinks}
                onEdit={handleEditLink}
                onDelete={handleDeleteLink}
                renderItem={(link) => (
                  <div className="min-w-0">
                    {link.title && (
                      <p className="font-medium text-sm truncate">{link.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                  </div>
                )}
              />
            </section>
          </div>
        )}

        <SheetFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
