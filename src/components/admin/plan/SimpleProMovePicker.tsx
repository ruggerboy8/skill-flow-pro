import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SimpleProMovePickerProps {
  roleId: number;
  selectedId: number;
  onSelect: (actionId: number, actionStatement: string, domainName: string) => void;
}

interface ProMoveOption {
  action_id: number;
  action_statement: string;
  domain_name: string;
}

export function SimpleProMovePicker({ roleId, selectedId, onSelect }: SimpleProMovePickerProps) {
  const [options, setOptions] = useState<ProMoveOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOptions();
  }, [roleId]);

  const loadOptions = async () => {
    try {
      const { data, error } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          competencies!inner(domains!inner(domain_name))
        `)
        .eq('role_id', roleId)
        .eq('active', true)
        .order('action_statement');

      if (error) throw error;

      const formatted = data?.map((row: any) => ({
        action_id: row.action_id,
        action_statement: row.action_statement,
        domain_name: row.competencies?.domains?.domain_name || 'Unknown'
      })) || [];

      setOptions(formatted);
    } catch (error: any) {
      console.error('[SimpleProMovePicker] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      value={selectedId.toString()}
      onValueChange={(value) => {
        const selected = options.find(o => o.action_id === parseInt(value));
        if (selected) {
          onSelect(selected.action_id, selected.action_statement, selected.domain_name);
        }
      }}
      disabled={loading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={loading ? "Loading..." : "Select a pro-move"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.action_id} value={option.action_id.toString()}>
            <div className="flex flex-col">
              <span className="font-medium">{option.action_statement}</span>
              <span className="text-xs text-muted-foreground">{option.domain_name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
