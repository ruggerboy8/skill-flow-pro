// Data hooks for the /ask spike surface (ASK-1).
//
// ask_conversations / ask_messages are asker-only under RLS, so every query
// here can select without filters — the database only returns the caller's
// own rows. The ask-alcan edge function does the corpus + Claude work and
// persists both sides of each exchange.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  AskConversationRow,
  AskMessageRow,
  AskAlcanResponse,
} from '@/integrations/supabase/corpusTypes';

// The ask_* tables are not in the generated Database type (see
// corpusTypes.ts), so queries cast through `any` at the client boundary.
const sb = supabase as any;

/** The caller's staff id (needed to insert a conversation under RLS). */
export function useOwnStaffId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['ask', 'own-staff-id', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sb
        .from('staff')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });
}

/** The caller's conversations, most recently active first. */
export function useAskConversations() {
  return useQuery({
    queryKey: ['ask', 'conversations'],
    queryFn: async (): Promise<AskConversationRow[]> => {
      const { data, error } = await sb
        .from('ask_conversations')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AskConversationRow[];
    },
  });
}

/** Messages of one conversation, oldest first. */
export function useAskMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['ask', 'messages', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<AskMessageRow[]> => {
      const { data, error } = await sb
        .from('ask_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AskMessageRow[];
    },
  });
}

/**
 * Citation chip data for historical messages: resolves cited document ids to
 * title + source_url. Corpus tables are super-admin readable, which every
 * /ask user is.
 */
export function useCitedDocuments(documentIds: string[]) {
  const key = [...documentIds].sort();
  return useQuery({
    queryKey: ['ask', 'cited-docs', key],
    enabled: documentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from('corpus_documents')
        .select('id, title, source_url')
        .in('id', key);
      if (error) throw error;
      const map = new Map<string, { id: string; title: string; source_url: string | null }>();
      for (const d of (data ?? []) as { id: string; title: string; source_url: string | null }[]) {
        map.set(d.id, d);
      }
      return map;
    },
  });
}

export function useAskMutations() {
  const queryClient = useQueryClient();
  const { data: staffId } = useOwnStaffId();

  /** Creates a conversation owned by the caller; returns its id. */
  const createConversation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!staffId) throw new Error('No staff profile for current user');
      const { data, error } = await sb
        .from('ask_conversations')
        .insert({ staff_id: staffId })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ask', 'conversations'] });
    },
  });

  /** Sends a question through the ask-alcan edge function. */
  const ask = useMutation({
    mutationFn: async (args: {
      conversationId: string;
      question: string;
    }): Promise<AskAlcanResponse> => {
      const { data, error } = await supabase.functions.invoke('ask-alcan', {
        body: { question: args.question, conversation_id: args.conversationId },
      });
      if (error) {
        // On non-2xx the invoke error carries only a generic message; the
        // server's real message ("question exceeds…", 403, …) is in the
        // response body, reachable via error.context.
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          if (body?.error) throw new Error(body.error);
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data as AskAlcanResponse;
    },
    // Awaiting the invalidations keeps the mutation pending until the
    // refetched messages have landed, so the page can hold its optimistic
    // pending bubble until the real rows are on screen (no flash).
    onSuccess: (_data, args) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ask', 'messages', args.conversationId] }),
        queryClient.invalidateQueries({ queryKey: ['ask', 'conversations'] }),
      ]),
  });

  /**
   * Deletes a conversation the caller owns; ask_messages rows cascade in the
   * database. RLS makes anyone else's rows unreachable.
   */
  const deleteConversation = useMutation({
    mutationFn: async (conversationId: string): Promise<void> => {
      const { error } = await sb.from('ask_conversations').delete().eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: (_data, conversationId) => {
      queryClient.removeQueries({ queryKey: ['ask', 'messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['ask', 'conversations'] });
    },
  });

  return { createConversation, ask, deleteConversation };
}
