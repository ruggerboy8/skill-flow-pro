import { Label } from '@/components/ui/label';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface MarkdownPreviewProps {
  value: string;
  onChange: (value: string) => void;
  maxChars?: number;
}

const modules = {
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    ['link'],
    ['clean']
  ],
};

const formats = [
  'header',
  'bold', 'italic', 'underline',
  'list', 'bullet',
  'link'
];

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
      
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder="Enter your script content here..."
        className="bg-background [&_.ql-container]:min-h-[300px] [&_.ql-editor]:min-h-[300px]"
      />
      
      {isNearLimit && (
        <p className="text-sm text-destructive">
          Warning: Approaching character limit
        </p>
      )}
    </div>
  );
}
