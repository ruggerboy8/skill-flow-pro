// ASK-1: the Ask Alcan spike surface. Super-admin-only (same gate as the
// surveys surface); answers come from the curated corpus via the ask-alcan
// edge function, with citation chips deep-linking to the Basecamp source.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { MessageSquare, MessagesSquare, Plus, Send, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAskAlcanAccess } from '@/lib/askAlcanAccess';
import {
  useAskConversations,
  useAskMessages,
  useAskMutations,
  useCitedDocuments,
} from '@/hooks/useAskAlcanChat';
import type { AskMessageRow } from '@/integrations/supabase/corpusTypes';

function CitationChips({
  documentIds,
  docs,
}: {
  documentIds: string[];
  docs: Map<string, { id: string; title: string; source_url: string | null }> | undefined;
}) {
  if (documentIds.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {documentIds.map((id) => {
        const doc = docs?.get(id);
        if (!doc) return null;
        const label = (
          <Badge variant="secondary" className="max-w-64 gap-1 font-normal">
            <span className="truncate">{doc.title}</span>
            {doc.source_url && <ExternalLink className="h-4 w-4 shrink-0" />}
          </Badge>
        );
        return doc.source_url ? (
          <a
            key={id}
            href={doc.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
            title={`Open "${doc.title}" in Basecamp`}
          >
            {label}
          </a>
        ) : (
          <span key={id}>{label}</span>
        );
      })}
    </div>
  );
}

function MessageBubble({
  message,
  docs,
}: {
  message: Pick<AskMessageRow, 'role' | 'content' | 'cited_document_ids'>;
  docs: Map<string, { id: string; title: string; source_url: string | null }> | undefined;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground'
            : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5'
        }
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        {!isUser && <CitationChips documentIds={message.cited_document_ids} docs={docs} />}
      </div>
    </div>
  );
}

export default function AskPage() {
  const { canAccess, isLoading: accessLoading } = useAskAlcanAccess();
  const { toast } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const { data: conversations, isLoading: conversationsLoading } = useAskConversations();
  const { data: messages, isLoading: messagesLoading } = useAskMessages(activeId);
  const { createConversation, ask } = useAskMutations();

  const citedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of messages ?? []) for (const id of m.cited_document_ids) ids.add(id);
    return [...ids];
  }, [messages]);
  const { data: citedDocs } = useCitedDocuments(citedIds);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingQuestion]);

  if (accessLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!canAccess) return <Navigate to="/" replace />;

  const busy = ask.isPending || createConversation.isPending;

  const send = async () => {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    setPendingQuestion(question);
    try {
      let conversationId = activeId;
      if (!conversationId) {
        conversationId = await createConversation.mutateAsync();
        setActiveId(conversationId);
      }
      await ask.mutateAsync({ conversationId, question });
    } catch (err) {
      setDraft(question); // let them retry without retyping
      toast({
        title: 'That question didn\'t go through',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPendingQuestion(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4 md:p-6">
      {/* Conversation list */}
      <aside className="hidden w-64 shrink-0 flex-col rounded-xl border bg-card md:flex">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessagesSquare className="h-4 w-4" />
            Conversations
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveId(null)}
            title="New conversation"
            disabled={busy}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {conversationsLoading && (
              <>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </>
            )}
            {(conversations ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full truncate rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                  c.id === activeId ? 'bg-accent font-medium' : 'text-muted-foreground'
                }`}
              >
                {c.title ?? 'New conversation'}
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat pane */}
      <main className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold">Ask Alcan</h1>
          <p className="text-sm text-muted-foreground">
            Answers come only from the reviewed company corpus, with sources cited.
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-2xl space-y-4 p-4">
            {activeId && messagesLoading && (
              <div className="space-y-3">
                <Skeleton className="ml-auto h-10 w-2/3" />
                <Skeleton className="h-20 w-3/4" />
              </div>
            )}
            {(messages ?? []).map((m) => (
              <MessageBubble key={m.id} message={m} docs={citedDocs} />
            ))}
            {pendingQuestion && (
              <>
                <MessageBubble
                  message={{ role: 'user', content: pendingQuestion, cited_document_ids: [] }}
                  docs={citedDocs}
                />
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                    Reading the corpus…
                  </div>
                </div>
              </>
            )}
            {!activeId && !pendingQuestion && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">Ask a question</p>
                  <p className="text-sm text-muted-foreground">
                    Try "What is the nitrous oxide monitoring requirement for new RDAs?"
                  </p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form
            className="mx-auto flex max-w-2xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask about a policy, price, or procedure…"
              rows={2}
              className="min-h-0 resize-none"
            />
            <Button type="submit" size="icon" disabled={busy || !draft.trim()} title="Send">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
