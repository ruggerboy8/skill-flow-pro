import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface MarkdownPreviewProps {
  value: string;
  onChange: (value: string) => void;
  maxChars?: number;
}

export function MarkdownPreview({ value, onChange, maxChars = 10000 }: MarkdownPreviewProps) {
  const charCount = value.length;
  const isNearLimit = charCount > maxChars * 0.8;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Script (Markdown)</Label>
        <span className={`text-sm ${isNearLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
          {charCount} / {maxChars} characters
        </span>
      </div>
      
      <Tabs defaultValue="edit" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        
        <TabsContent value="edit" className="mt-2">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter your script content here. Markdown is supported..."
            className="min-h-[300px] font-mono text-sm"
          />
        </TabsContent>
        
        <TabsContent value="preview" className="mt-2">
          <div className="min-h-[300px] p-4 border rounded-md bg-muted/50">
            {value ? (
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">No content to preview</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {isNearLimit && (
        <p className="text-sm text-destructive">
          Warning: Approaching character limit
        </p>
      )}
    </div>
  );
}

// Basic markdown rendering (can be enhanced with a library like marked or react-markdown)
function renderMarkdown(text: string): string {
  let html = text
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Line breaks
    .replace(/\n/g, '<br>');
  
  // Basic XSS prevention
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  return html;
}
