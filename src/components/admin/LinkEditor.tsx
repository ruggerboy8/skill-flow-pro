import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateLinkUrl, validateLinkTitle } from '@/lib/linkValidation';

interface LinkEditorProps {
  link?: { id?: string; url: string; title?: string };
  onSave: (link: { id?: string; url: string; title?: string }) => void;
  onCancel: () => void;
}

export function LinkEditor({ link, onSave, onCancel }: LinkEditorProps) {
  const [url, setUrl] = useState(link?.url || '');
  const [title, setTitle] = useState(link?.title || '');
  const [urlError, setUrlError] = useState<string>();
  const [titleError, setTitleError] = useState<string>();

  const handleSave = () => {
    const urlValidation = validateLinkUrl(url);
    const titleValidation = validateLinkTitle(title);
    
    setUrlError(urlValidation.error);
    setTitleError(titleValidation.error);
    
    if (urlValidation.valid && titleValidation.valid) {
      onSave({
        id: link?.id,
        url,
        title: title.trim() || undefined,
      });
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
      <div className="space-y-2">
        <Label htmlFor="link-url">URL *</Label>
        <Input
          id="link-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className={urlError ? 'border-destructive' : ''}
        />
        {urlError && <p className="text-sm text-destructive">{urlError}</p>}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="link-title">Title (optional)</Label>
        <Input
          id="link-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Resource name"
          maxLength={80}
          className={titleError ? 'border-destructive' : ''}
        />
        {titleError && <p className="text-sm text-destructive">{titleError}</p>}
      </div>
      
      <div className="flex gap-2">
        <Button onClick={handleSave} size="sm">
          {link?.id ? 'Update' : 'Add'} Link
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}
