// ASK-1b: the Ask Alcan chat surface, rebuilt on AI Elements (see
// docs/specs/ask-1b-chat-ui-adoption.md). Super-admin-only (same gate as the
// surveys surface); answers come from the curated corpus via the ask-alcan
// edge function, with citation chips deep-linking to the Basecamp source.
//
// Data layer (useAskAlcanChat.ts) and the ask-alcan response contract are
// unchanged by this ticket — this is a presentation rebuild only.

import { useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Lock,
  MessageSquare,
  MessagesSquare,
  Plus,
  ExternalLink,
  Trash2,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { useToast } from '@/hooks/use-toast';
import { useAskAlcanAccess } from '@/lib/askAlcanAccess';
import {
  useAskConversations,
  useAskMessages,
  useAskMutations,
  useCitedDocuments,
} from '@/hooks/useAskAlcanChat';
import type { AskConversationRow, AskMessageRow } from '@/integrations/supabase/corpusTypes';
import {
  computeShowPending,
  useIsTouchDevice,
  usePrefersReducedMotion,
  type PendingAsk,
} from './askPageLogic';

// Matches MAX_QUESTION_CHARS in the ask-alcan edge function.
const MAX_QUESTION_CHARS = 4000;

const EXAMPLE_QUESTIONS = [
  'How do we welcome a nervous first-time family?',
  'What do I say when a parent asks if we’re still in-network?',
  'What is the nitrous oxide monitoring requirement for new RDAs?',
];

type CitedDocsMap = Map<string, { id: string; title: string; source_url: string | null }>;

function CitationChips({
  documentIds,
  docs,
}: {
  documentIds: string[];
  docs: CitedDocsMap | undefined;
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

function ChatMessage({
  message,
  docs,
}: {
  message: Pick<AskMessageRow, 'role' | 'content' | 'cited_document_ids'>;
  docs: CitedDocsMap | undefined;
}) {
  const isUser = message.role === 'user';
  return (
    <Message from={isUser ? 'user' : 'assistant'}>
      <MessageContent>
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : (
          <MessageResponse>{message.content}</MessageResponse>
        )}
        {!isUser && <CitationChips documentIds={message.cited_document_ids} docs={docs} />}
      </MessageContent>
    </Message>
  );
}

function ThinkingBubble() {
  return (
    <Message from="assistant">
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
    </Message>
  );
}

function ConversationRow({
  conversation,
  isActive,
  busy,
  onSelect,
  onDelete,
}: {
  conversation: AskConversationRow;
  isActive: boolean;
  busy: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const title = conversation.title ?? 'New conversation';
  return (
    <div className="group relative flex min-w-0 items-center">
      <button
        onClick={onSelect}
        disabled={busy}
        className={`min-h-11 w-full min-w-0 truncate rounded-md px-3 py-2.5 pr-11 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60 ${
          isActive ? 'bg-accent font-medium' : 'text-muted-foreground'
        }`}
      >
        <span className="block min-w-0 truncate">{title}</span>
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        title="Delete conversation"
        aria-label={`Delete conversation "${title}"`}
        className="absolute right-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-0"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
  );
}

function ConversationListPane({
  conversations,
  loading,
  activeId,
  busy,
  onSelect,
  onNew,
  onDeleteRequest,
}: {
  conversations: AskConversationRow[] | undefined;
  loading: boolean;
  activeId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleteRequest: (id: string, title: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessagesSquare className="h-5 w-5" />
          Conversations
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNew}
          title="New conversation"
          aria-label="New conversation"
          disabled={busy}
          className="h-11 w-11 md:h-10 md:w-10"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {loading && (
          <>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </>
        )}
        {(conversations ?? []).map((c) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            isActive={c.id === activeId}
            busy={busy}
            onSelect={() => onSelect(c.id)}
            onDelete={() => onDeleteRequest(c.id, c.title ?? 'New conversation')}
          />
        ))}
      </div>
    </>
  );
}

export default function AskPage() {
  const { canAccess, isLoading: accessLoading } = useAskAlcanAccess();
  const { toast } = useToast();
  const isTouch = useIsTouchDevice();
  const reducedMotion = usePrefersReducedMotion();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);

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
  // up until the refetched rows for that exchange are on screen (see
  // computeShowPending in askPageLogic.ts for the carried-over PR #81 fix).
  const showPending = computeShowPending(pending, activeId, messages?.length ?? 0);

  const composerRef = useRef<HTMLTextAreaElement>(null);

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

  const selectConversation = (id: string | null) => {
    setActiveId(id);
    setMobileListOpen(false);
  };

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

  const status: 'idle' | 'submitted' = busy ? 'submitted' : 'idle';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row md:gap-4">
      {/* Conversation list — sidebar on desktop, a Sheet drawer on mobile */}
      <aside className="hidden w-64 shrink-0 flex-col rounded-xl border bg-card md:flex">
        <ConversationListPane
          conversations={conversations}
          loading={conversationsLoading}
          activeId={activeId}
          busy={busy}
          onSelect={selectConversation}
          onNew={() => selectConversation(null)}
          onDeleteRequest={(id, title) => setDeleteTarget({ id, title })}
        />
      </aside>

      <Sheet open={mobileListOpen} onOpenChange={setMobileListOpen}>
        <SheetContent side="left" className="flex w-[85%] max-w-sm flex-col p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          <ConversationListPane
            conversations={conversations}
            loading={conversationsLoading}
            activeId={activeId}
            busy={busy}
            onSelect={selectConversation}
            onNew={() => selectConversation(null)}
            onDeleteRequest={(id, title) => setDeleteTarget({ id, title })}
          />
        </SheetContent>
      </Sheet>

      {/* Chat pane */}
      <main className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card">
        <div className="flex items-start gap-2 border-b p-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 md:hidden"
            onClick={() => setMobileListOpen(true)}
            aria-label="Open conversation list"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
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
        </div>

        <Conversation
          className="min-h-0"
          initial={reducedMotion ? 'instant' : 'smooth'}
          resize={reducedMotion ? 'instant' : 'smooth'}
        >
          <ConversationContent>
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
              <ChatMessage key={m.id} message={m} docs={citedDocs} />
            ))}
            {showPending && (
              <>
                <ChatMessage
                  message={{ role: 'user', content: pending!.question, cited_document_ids: [] }}
                  docs={citedDocs}
                />
                <ThinkingBubble />
              </>
            )}
            {!activeId && !pending && (
              <ConversationEmptyState>
                <MessageSquare className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
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
                      onClick={() => {
                        setDraft(q);
                        composerRef.current?.focus();
                      }}
                      className="min-h-11 rounded-lg border bg-background px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </ConversationEmptyState>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t p-3 md:p-4">
          <PromptInput
            className="mx-auto max-w-2xl"
            onSubmit={() => {
              void send();
            }}
          >
            <PromptInputTextarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              enterToSend={!isTouch}
              placeholder="Ask how we do things here — scripts, setups, policies…"
              aria-label="Your question"
              maxLength={MAX_QUESTION_CHARS}
            />
            <PromptInputFooter>
              <span className="text-2xs text-muted-foreground">
                {isTouch ? 'Tap send to ask' : 'Enter to send, Shift+Enter for a new line'}
              </span>
              <PromptInputSubmit
                status={status}
                disabled={busy || !draft.trim()}
                className="h-11 w-11 md:h-9 md:w-9"
              />
            </PromptInputFooter>
          </PromptInput>
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
