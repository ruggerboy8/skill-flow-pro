// ASK-1: the Ask Alcan spike surface. Super-admin-only (same gate as the
// surveys surface); answers come from the curated corpus via the ask-alcan
// edge function, with citation chips deep-linking to the Basecamp source.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Lock, MessageSquare, MessagesSquare, Plus, Send, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAskAlcanAccess } from '@/lib/askAlcanAccess';
import {
  useAskConversations,
  useAskMessages,
  useAskMutations,
  useCitedDocuments,
} from '@/hooks/useAskAlcanChat';
import type { AskMessageRow } from '@/integrations/supabase/corpusTypes';

// Matches MAX_QUESTION_CHARS in the ask-alcan edge function.
const MAX_QUESTION_CHARS = 4000;

const EXAMPLE_QUESTIONS = [
  'How do we welcome a nervous first-time family?',
  'What do I say when a parent asks if we’re still in-network?',
  'What is the nitrous oxide monitoring requirement for new RDAs?',
];

function CitationChips({
  documentIds,
  docs,
}: {
  documentIds: string[];
  docs: Map<string, { id: string; title: string; source_url: string | null }> | undefined;
}) {
  if (documentIds.length === 0) return null;
  return (
    <div className="mt-2">
      <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        Sources
      </span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {documentIds.map((id) => {
          const doc = docs?.get(id);
          if (!doc) {
            // A cited doc the lookup can't resolve (e.g. later rejected) still
            // leaves a trace instead of silently vanishing.
            return (
              <Badge key={id} variant="outline" className="font-normal text-muted-foreground">
                source no longer available
              </Badge>
            );
          }
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
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : (
          <div className="space-y-2 text-sm leading-relaxed [&_a]:underline [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {!isUser && <CitationChips documentIds={message.cited_document_ids} docs={docs} />}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground"
      >
        <span>Checking our playbook</span>
        <span className="flex gap-0.5 motion-reduce:hidden" aria-hidden="true">
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
        </span>
        <span className="hidden motion-reduce:inline" aria-hidden="true">
          …
        </span>
      </div>
    </div>
  );
}

interface PendingAsk {
  // null while the conversation is still being created for a first send.
  conversationId: string | null;
  question: string;
  // Message count at send time — the pending bubble stays up until the two
  // real rows (question + answer) have landed, independent of content, so a
  // repeated question still shows feedback.
  prevCount: number;
}

export default function AskPage() {
  const { canAccess, isLoading: accessLoading } = useAskAlcanAccess();
  const { toast } = useToast();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const { data: conversations, isLoading: conversationsLoading } = useAskConversations();
  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useAskMessages(activeId);
  const { createConversation, ask, deleteConversation } = useAskMutations();

  const citedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of messages ?? []) for (const id of m.cited_document_ids) ids.add(id);
    return [...ids];
  }, [messages]);
  const { data: citedDocs } = useCitedDocuments(citedIds);

  // The pending bubble is keyed to the conversation it was sent in, and stays
  // up until the refetched rows for that exchange are on screen.
  const showPending =
    !!pending &&
    pending.conversationId === activeId &&
    (messages?.length ?? 0) < pending.prevCount + 2;

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [messages, pending]);

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
    if (question.length > MAX_QUESTION_CHARS) {
      toast({
        title: 'That question is a bit long',
        description: `Questions max out at ${MAX_QUESTION_CHARS.toLocaleString()} characters — trim it down and resend.`,
        variant: 'destructive',
      });
      return;
    }
    setDraft('');
    setPending({ conversationId: activeId, question, prevCount: messages?.length ?? 0 });
    let createdNewId: string | null = null;
    try {
      let conversationId = activeId;
      if (!conversationId) {
        conversationId = await createConversation.mutateAsync();
        createdNewId = conversationId;
        setActiveId(conversationId);
        setPending((p) => (p ? { ...p, conversationId } : p));
      }
      await ask.mutateAsync({ conversationId, question });
    } catch (err) {
      setDraft(question); // let them retry without retyping
      toast({
        title: 'That question didn’t go through',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      // A conversation created for this send holds nothing on failure —
      // remove it rather than stranding an untitled ghost in the list.
      if (createdNewId) {
        setActiveId(null);
        deleteConversation.mutate(createdNewId);
      }
    } finally {
      setPending(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteConversation.mutateAsync(deleteTarget.id);
      if (activeId === deleteTarget.id) setActiveId(null);
    } catch (err) {
      toast({
        title: 'Couldn’t delete that conversation',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleteTarget(null);
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
            aria-label="New conversation"
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
              <div key={c.id} className="group relative">
                <button
                  onClick={() => setActiveId(c.id)}
                  disabled={busy}
                  className={`w-full truncate rounded-md px-3 py-2 pr-9 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60 ${
                    c.id === activeId ? 'bg-accent font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {c.title ?? 'New conversation'}
                </button>
                <button
                  onClick={() =>
                    setDeleteTarget({ id: c.id, title: c.title ?? 'New conversation' })
                  }
                  disabled={busy}
                  title="Delete conversation"
                  aria-label={`Delete conversation "${c.title ?? 'New conversation'}"`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat pane */}
      <main className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold">Ask Alcan</h1>
          <p className="text-sm text-muted-foreground">
            Real answers from Alcan&apos;s own playbook — every answer shows you where it came
            from.
          </p>
          <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
            Your conversations are private to you. No one else can read them — not even admins.
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-2xl space-y-4 p-4" aria-live="polite">
            {activeId && messagesLoading && (
              <div className="space-y-3">
                <Skeleton className="ml-auto h-10 w-2/3" />
                <Skeleton className="h-20 w-3/4" />
              </div>
            )}
            {activeId && messagesError && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <p>This conversation didn&apos;t load.</p>
                <Button variant="outline" size="sm" onClick={() => void refetchMessages()}>
                  Try again
                </Button>
              </div>
            )}
            {(messages ?? []).map((m) => (
              <MessageBubble key={m.id} message={m} docs={citedDocs} />
            ))}
            {showPending && (
              <>
                <MessageBubble
                  message={{ role: 'user', content: pending!.question, cited_document_ids: [] }}
                  docs={citedDocs}
                />
                <ThinkingBubble />
              </>
            )}
            {!activeId && !pending && (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">Ask a question</p>
                  <p className="text-sm text-muted-foreground">
                    Anything about how we do things at Alcan. A few to get you going:
                  </p>
                </div>
                <div className="flex max-w-md flex-col gap-2">
                  {EXAMPLE_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => setDraft(q)}
                      className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
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
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask how we do things here — scripts, setups, policies…"
              aria-label="Your question"
              maxLength={MAX_QUESTION_CHARS}
              rows={2}
              className="min-h-0 resize-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || !draft.trim()}
              title="Send"
              aria-label="Send question"
            >
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </div>
      </main>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.title}&rdquo; and its messages will be permanently deleted.
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
