import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Role {
  role_id: number;
  role_name: string;
}

interface Competency {
  competency_id: number;
  name: string;
}

interface BulkUploadProps {
  onClose: () => void;
  roles: Role[];
  competencies: Competency[];
}

interface ParsedRow {
  index: number;
  data: any;
  status: 'new' | 'update' | 'error';
  error?: string;
  role_id?: number;
  competency_id?: number;
}

export function BulkUpload({ onClose, roles, competencies }: BulkUploadProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  // Proper CSV parsing function that handles quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    return result;
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
    
    const parsed: ParsedRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
      const rowData: any = {};
      
      headers.forEach((header, index) => {
        rowData[header] = values[index] || '';
      });

      const row: ParsedRow = {
        index: i,
        data: rowData,
        status: 'error'
      };

      // Validate required fields
      if (!rowData.role_name || !rowData.competency_name || !rowData.text) {
        row.error = 'Missing required fields (role_name, competency_name, text)';
        parsed.push(row);
        continue;
      }

      // Find role_id
      const role = roles.find(r => r.role_name.toLowerCase() === rowData.role_name.toLowerCase());
      if (!role) {
        row.error = `Role not found: ${rowData.role_name}`;
        parsed.push(row);
        continue;
      }

      // Find competency_id
      const competency = competencies.find(c => c.name.toLowerCase() === rowData.competency_name.toLowerCase());
      if (!competency) {
        row.error = `Competency not found: ${rowData.competency_name}`;
        parsed.push(row);
        continue;
      }

      row.role_id = role.role_id;
      row.competency_id = competency.competency_id;
      row.status = 'new'; // For now, assume all are new. In a full implementation, we'd check for existing ones
      parsed.push(row);
    }

    setParsedRows(parsed);
    setStep('preview');
  };

  const handleApply = async () => {
    const validRows = parsedRows.filter(row => row.status !== 'error');
    
    if (validRows.length === 0) {
      toast({
        title: "No Valid Rows",
        description: "Please fix errors before applying.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const data = validRows.map(row => ({
        role_name: row.data.role_name,
        competency_name: row.data.competency_name,
        text: row.data.text,
        description: row.data.description || null,
        resources_url: row.data.resources_url || null,
        active: row.data.active === 'false' ? false : true
      }));

      const { data: result, error } = await supabase.rpc('bulk_upsert_pro_moves', {
        pro_moves_data: data
      });

      if (error) throw error;

      setResults(result);
      setStep('complete');
      
      const resultData = result as any;
      toast({
        title: "Success",
        description: `Processed ${(resultData.created || 0) + (resultData.updated || 0)} pro-moves successfully.`,
      });

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process bulk upload.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadErrorCSV = () => {
    const errorRows = parsedRows.filter(row => row.status === 'error');
    if (errorRows.length === 0) return;

    const headers = Object.keys(errorRows[0].data);
    const csvContent = [
      [...headers, 'error'].join(','),
      ...errorRows.map(row => [
        ...headers.map(h => `"${row.data[h] || ''}"`),
        `"${row.error}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bulk-upload-errors.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'update':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Upload Pro-Moves</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Upload CSV File</h3>
                <p className="text-gray-600 mb-4">
                  Select a CSV file with pro-moves data to upload
                </p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                 <label htmlFor="file-upload">
                  <Button asChild>
                    <span>Choose File</span>
                  </Button>
                </label>
                <div className="mt-4">
                  <Button variant="outline" asChild>
                    <a href="/pro-moves-template.csv" download="pro-moves-template.csv">
                      <Download className="w-4 h-4 mr-2" />
                      Download Template
                    </a>
                  </Button>
                </div>
              </div>
              
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-2">Required CSV columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>role_name</code> - Role name (DFI, RDA)</li>
                  <li><code>competency_name</code> - Exact competency name</li>
                  <li><code>text</code> - Pro-move statement</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Optional columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>description</code> - Coach notes</li>
                  <li><code>resources_url</code> - Training materials URL</li>
                  <li><code>active</code> - true/false (defaults to true)</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Preview Import</h3>
                <div className="flex gap-2">
                  {parsedRows.filter(r => r.status === 'error').length > 0 && (
                    <Button variant="outline" size="sm" onClick={downloadErrorCSV}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Errors
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex gap-4 text-sm">
                <Badge variant="outline" className="text-green-600">
                  New: {parsedRows.filter(r => r.status === 'new').length}
                </Badge>
                <Badge variant="outline" className="text-blue-600">
                  Update: {parsedRows.filter(r => r.status === 'update').length}
                </Badge>
                <Badge variant="outline" className="text-red-600">
                  Errors: {parsedRows.filter(r => r.status === 'error').length}
                </Badge>
              </div>

              <div className="border rounded-lg max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Competency</TableHead>
                      <TableHead>Pro-Move Text</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.map((row) => (
                      <TableRow key={row.index}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(row.status)}
                            <span className="capitalize">{row.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>{row.data.role_name}</TableCell>
                        <TableCell>{row.data.competency_name}</TableCell>
                        <TableCell className="max-w-md truncate">{row.data.text}</TableCell>
                        <TableCell className="text-red-600 text-sm">{row.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === 'complete' && results && (
            <div className="space-y-6 text-center">
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
              <div>
                <h3 className="text-lg font-medium mb-2">Upload Complete</h3>
                <div className="space-y-2">
                  <p>Created: <strong>{(results as any).created || 0}</strong> new pro-moves</p>
                  <p>Updated: <strong>{(results as any).updated || 0}</strong> existing pro-moves</p>
                  {(results as any).errors && (results as any).errors.length > 0 && (
                    <p className="text-red-600">
                      Errors: <strong>{(results as any).errors.length}</strong> rows failed
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button 
                onClick={handleApply}
                disabled={loading || parsedRows.filter(r => r.status !== 'error').length === 0}
              >
                {loading ? "Processing..." : "Apply Changes"}
              </Button>
            </>
          )}
          
          {(step === 'upload' || step === 'complete') && (
            <Button onClick={onClose}>
              {step === 'complete' ? 'Done' : 'Cancel'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}