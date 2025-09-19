import { useState, useMemo } from 'react';

export type SortOrder = 'asc' | 'desc' | null;

export interface SortConfig {
  key: string;
  order: SortOrder;
}

export function useTableSort<T>(data: T[], initialSortKey?: string) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: initialSortKey || '',
    order: null,
  });

  const sortedData = useMemo(() => {
    if (!sortConfig.key || sortConfig.order === null) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.key);
      const bValue = getNestedValue(b, sortConfig.key);

      if (aValue < bValue) {
        return sortConfig.order === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.order === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prevConfig => {
      if (prevConfig.key !== key) {
        // New column, start with ascending
        return { key, order: 'asc' };
      }
      
      // Same column, cycle through states
      if (prevConfig.order === null) {
        return { key, order: 'asc' };
      } else if (prevConfig.order === 'asc') {
        return { key, order: 'desc' };
      } else {
        return { key, order: null };
      }
    });
  };

  return {
    sortedData,
    sortConfig,
    handleSort,
  };
}

// Helper function to get nested values from objects
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object') {
      return current[key];
    }
    return current;
  }, obj) ?? '';
}