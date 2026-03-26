import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertCircle, CheckCircle, Clock, Loader2, Upload, ArrowRight, ArrowLeft } from 'lucide-react';

const PRACTICE_TYPE_OPTIONS = [
  { value: 'pediatric_us', label: 'Pediatric – US' },
  { value: 'general_us', label: 'General – US' },
  { value: 'general_uk', label: 'General – UK' },
] as const;

const KNOWN_HEADERS = ['competency_name', 'text', 'description', 'intervention_text', 'script', 'resources_url', 'active', 'action_id'];
const DEFAULT_COLUMN_ORDER = ['competency_name', 'text', 'description', 'intervention_text', 'script'];

interface RoleCompetency {
  competency_id: number;
  name: string;
}

interface ParsedRow {
  index: number;
  data: Record<string, string>;
  status: 'new' | 'update' | 'error';
  error?: string;
  suggestion?: string;
  competency_id?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleId: number;
  roleName: string;
  rolePracticeType?: string;
  onImported: () => void;
}

export function ProMoveImportDialog({ open, onOpenChange, roleId, roleName, rolePracticeType, onImported }: Props) {
  const [step, setStep] = useState<'config' | 'paste' | 'preview' | 'complete'>('config');
  const [practiceTypes, setPracticeTypes] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [roleCompetencies, setRoleCompetencies] = useState<RoleCompetency[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [csvFallback, setCsvFallback] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep('config');
      setPasteText('');
      setParsedRows([]);
      setResults(null);
      setCsvFallback(false);
      // Pre-fill practice type from role
      if (rolePracticeType) {
        setPracticeTypes([rolePracticeType]);
      } else {
        setPracticeTypes([]);
      }
    }
  }, [open, rolePracticeType]);

  // Fetch competencies for selected role
  useEffect(() => {
    if (open && roleId) {
      supabase
        .from('competencies')
        .select('competency_id, name')
        .eq('role_id', roleId)
        .order('competency_id')
        .then(({ data }) => {
          setRoleCompetencies(data ?? []);
        });
    }
  }, [open, roleId]);

  const togglePracticeType = (val: string) => {
    setPracticeTypes(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const fuzzyMatch = (input: string, candidates: RoleCompetency[]): RoleCompetency | null => {
    const lower = input.toLowerCase().trim();
    // Exact
    const exact = candidates.find(c => c.name?.toLowerCase() === lower);
    if (exact) return exact;
    // Substring
    const sub = candidates.find(c => c.name?.toLowerCase().includes(lower) || lower.includes(c.name?.toLowerCase() ?? ''));
    return sub ?? null;
  };

  const parseTSV = async (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    if (lines.length === 0) {
      toast.error('No data found in pasted text');
      return;
    }

    // Detect if first row is headers
    const firstLineCols = lines[0].split('\t');
    const hasHeaders = firstLineCols.some(c =>
      KNOWN_HEADERS.includes(c.trim().toLowerCase().replace(/\s+/g, '_'))
    );

    let headers: string[];
    let dataStartIdx: number;

    if (hasHeaders) {
      headers = firstLineCols.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      dataStartIdx = 1;
    } else {
      headers = DEFAULT_COLUMN_ORDER.slice(0, firstLineCols.length);
      dataStartIdx = 0;
    }

    const parsed: ParsedRow[] = [];

    for (let i = dataStartIdx; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const rowData: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowData[h] = (cols[idx] ?? '').trim();
      });

      const row: ParsedRow = { index: i, data: rowData, status: 'error' };

      // Validate required: competency_name and text
      if (!rowData.competency_name || !rowData.text) {
        row.error = 'Missing competency_name or text';
        parsed.push(row);
        continue;
      }

      // Match competency
      const match = fuzzyMatch(rowData.competency_name, roleCompetencies);
      if (!match) {
        row.error = `Competency not found: "${rowData.competency_name}"`;
        // Try suggestion
        const partial = roleCompetencies.find(c =>
          c.name?.toLowerCase().includes(rowData.competency_name.toLowerCase().slice(0, 10))
        );
        if (partial) row.suggestion = `Did you mean: "${partial.name}"?`;
        parsed.push(row);
        continue;
      }

      row.competency_id = match.competency_id;

      // Check for existing pro move
      if (rowData.action_id?.trim()) {
        const { data: existing } = await supabase
          .from('pro_moves')
          .select('action_id')
          .eq('action_id', parseInt(rowData.action_id))
          .maybeSingle();
        row.status = existing ? 'update' : 'error';
        if (!existing) row.error = `Pro-move ID ${rowData.action_id} not found`;
      } else {
        const { data: existing } = await supabase
          .from('pro_moves')
          .select('action_id')
          .eq('role_id', roleId)
          .eq('competency_id', match.competency_id)
          .ilike('action_statement', rowData.text)
          .maybeSingle();
        row.status = existing ? 'update' : 'new';
      }

      parsed.push(row);
    }

    setParsedRows(parsed);
    setStep('preview');
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    // Convert CSV to TSV-like for the same parser
    // Simple: replace commas with tabs (handles basic cases)
    // For proper CSV, use a real parser
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const tsvText = lines.map(line => {
      // Handle quoted CSV fields
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      fields.push(current.trim());
      return fields.join('\t');
    }).join('\n');
    await parseTSV(tsvText);
  };

  const handleApply = async () => {
    const validRows = parsedRows.filter(r => r.status !== 'error');
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }

    setLoading(true);
    try {
      const roleName_ = (await supabase.from('roles').select('role_name').eq('role_id', roleId).single()).data?.role_name ?? '';

      const data = validRows.map(row => ({
        action_id: row.data.action_id?.trim() ? parseInt(row.data.action_id) : null,
        role_name: roleName_,
        competency_name: row.data.competency_name,
        action_statement: row.data.text,
        description: row.data.description || null,
        resources_url: row.data.resources_url || null,
        intervention_text: row.data.intervention_text || null,
        script: row.data.script || null,
        active: row.data.active?.toLowerCase() === 'false' ? false : true,
        practice_types: practiceTypes.join('|'),
      }));

      const { data: result, error } = await supabase.rpc('bulk_upsert_pro_moves', {
        pro_moves_data: data,
      });

      if (error) throw error;
      setResults(result);
      setStep('complete');
      const r = result as any;
      toast.success(`Imported ${(r.created || 0) + (r.updated || 0)} pro moves`);
    } catch (err: any) {
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const newCount = parsedRows.filter(r => r.status === 'new').length;
  const updateCount = parsedRows.filter(r => r.status === 'update').length;
  const errorCount = parsedRows.filter(r => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Pro Moves → {roleName}</DialogTitle>
          <DialogDescription>
            {step === 'config' && 'Select practice types for these pro moves.'}
            {step === 'paste' && 'Paste rows from your spreadsheet. Tab-separated columns are auto-detected.'}
            {step === 'preview' && 'Review the parsed data before importing.'}
            {step === 'complete' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pb-2 border-b">
          {['config', 'paste', 'preview', 'complete'].map((s, i) => (
            <span key={s} className={`${step === s ? 'text-foreground font-medium' : ''}`}>
              {i > 0 && <span className="mx-1">→</span>}
              {['Practice Types', 'Paste Data', 'Review', 'Done'][i]}
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-auto py-4">
          {/* STEP 1: Config */}
          {step === 'config' && (
            <div className="space-y-6">
              <div>
                <Label className="text-sm font-medium">Target Role</Label>
                <p className="text-sm text-muted-foreground mt-1">{roleName}</p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Practice Type(s)</Label>
                <p className="text-xs text-muted-foreground">Which practice types should these pro moves apply to?</p>
                <div className="flex flex-wrap gap-4">
                  {PRACTICE_TYPE_OPTIONS.map(({ value, label }) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={practiceTypes.includes(value)}
                        onCheckedChange={() => togglePracticeType(value)}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {roleCompetencies.length > 0 && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    {roleCompetencies.length} competencies available for matching:
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {roleCompetencies.map(c => c.name).join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Paste */}
          {step === 'paste' && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">Expected columns (tab-separated):</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  competency_name &nbsp;|&nbsp; text &nbsp;|&nbsp; description &nbsp;|&nbsp; intervention_text &nbsp;|&nbsp; script
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Only <strong>competency_name</strong> and <strong>text</strong> are required. Headers are auto-detected if present.
                </p>
              </div>

              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste rows from Excel or Google Sheets here..."
                className="min-h-[250px] font-mono text-xs"
              />

              {!csvFallback && (
                <button
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setCsvFallback(true)}
                >
                  or upload a CSV file instead
                </button>
              )}
              {csvFallback && (
                <input type="file" accept=".csv" onChange={handleCSVUpload} className="text-sm" />
              )}
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex gap-3 text-sm">
                <Badge variant="outline" className="text-green-600 border-green-200">
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> New: {newCount}
                </Badge>
                <Badge variant="outline" className="text-blue-600 border-blue-200">
                  <Clock className="h-3.5 w-3.5 mr-1" /> Update: {updateCount}
                </Badge>
                <Badge variant="outline" className="text-red-600 border-red-200">
                  <AlertCircle className="h-3.5 w-3.5 mr-1" /> Errors: {errorCount}
                </Badge>
              </div>

              <div className="border rounded-lg max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead>Competency</TableHead>
                      <TableHead>Pro Move Text</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row) => (
                      <TableRow key={row.index}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {row.status === 'new' && <CheckCircle className="h-4 w-4 text-green-600" />}
                            {row.status === 'update' && <Clock className="h-4 w-4 text-blue-600" />}
                            {row.status === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
                            <span className="text-xs capitalize">{row.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{row.data.competency_name}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{row.data.text}</TableCell>
                        <TableCell className="text-xs">
                          {row.error && <span className="text-destructive">{row.error}</span>}
                          {row.suggestion && <span className="text-muted-foreground block">{row.suggestion}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Processing import…</p>
              </div>
            </div>
          )}

          {/* STEP 4: Complete */}
          {step === 'complete' && results && (
            <div className="text-center space-y-4 py-8">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm">Created: <strong>{(results as any).created || 0}</strong></p>
                <p className="text-sm">Updated: <strong>{(results as any).updated || 0}</strong></p>
                {(results as any).skipped > 0 && (
                  <p className="text-sm text-muted-foreground">Skipped: {(results as any).skipped}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t">
          <div>
            {step === 'paste' && (
              <Button variant="ghost" size="sm" onClick={() => setStep('config')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {step === 'preview' && (
              <Button variant="ghost" size="sm" onClick={() => setStep('paste')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'config' && (
              <Button
                onClick={() => setStep('paste')}
                disabled={practiceTypes.length === 0}
              >
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 'paste' && (
              <Button
                onClick={() => parseTSV(pasteText)}
                disabled={!pasteText.trim()}
              >
                Review <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {step === 'preview' && (
              <Button
                onClick={handleApply}
                disabled={loading || newCount + updateCount === 0}
              >
                {loading ? 'Importing…' : `Import ${newCount + updateCount} Pro Moves`}
              </Button>
            )}
            {step === 'complete' && (
              <Button onClick={() => { onImported(); onOpenChange(false); }}>
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
