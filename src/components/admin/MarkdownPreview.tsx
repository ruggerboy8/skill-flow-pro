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
        <Label>Script</Label>
        <span className={`text-sm ${isNearLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
          {charCount} / {maxChars} characters
        </span>
      </div>
      
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your script content here..."
        className="min-h-[300px] text-sm resize-y"
      />
      
      {isNearLimit && (
        <p className="text-sm text-destructive">
          Warning: Approaching character limit
        </p>
      )}
    </div>
  );
}
