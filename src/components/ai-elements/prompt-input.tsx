// Vendored from AI Elements (https://elements.ai-sdk.dev/components/prompt-input),
// trimmed for ASK-1b: our composer is text-only (no file/screenshot
// attachments, no action-menu, no command palette, no model select), so this
// keeps just the form + textarea + submit-button pieces we actually render.
// Enter-to-send / Shift+Enter-for-newline / IME-composition handling matches
// upstream; the touch-vs-pointer gating for Enter-to-send lives in AskPage
// (per spec: "Enter-to-send gated to non-touch").

import {
  InputGroup,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { CornerDownLeftIcon } from "lucide-react";
import type {
  ComponentProps,
  FormEvent,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
} from "react";
import { forwardRef, useCallback } from "react";

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit"
> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
};

export const PromptInput = ({
  className,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      void onSubmit(event);
    },
    [onSubmit]
  );

  return (
    <form className={cn("w-full", className)} onSubmit={handleSubmit} {...props}>
      <InputGroup className="overflow-hidden">{children}</InputGroup>
    </form>
  );
};

export type PromptInputTextareaProps = ComponentProps<
  typeof InputGroupTextarea
> & {
  /** When false, Enter submits on its own line-break key too (touch devices). */
  enterToSend?: boolean;
};

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  PromptInputTextareaProps
>(({ onKeyDown, className, placeholder = "What would you like to know?", enterToSend = true, ...props }, ref) => {
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (!enterToSend) return;
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const { form } = e.currentTarget;
        const submitButton = form?.querySelector(
          'button[type="submit"]'
        ) as HTMLButtonElement | null;
        if (submitButton?.disabled) return;
        form?.requestSubmit();
      }
    },
    [onKeyDown, enterToSend]
  );

  return (
    <InputGroupTextarea
      ref={ref}
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = "PromptInputTextarea";

export type PromptInputFooterProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputFooter = ({
  className,
  ...props
}: PromptInputFooterProps) => (
  <div
    data-slot="input-group-addon"
    data-align="block-end"
    className={cn(
      "text-muted-foreground flex h-auto w-full cursor-text select-none items-center justify-between gap-2 px-3 pb-3 pt-1.5 text-sm font-medium",
      className
    )}
    {...props}
  />
);

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: "idle" | "submitted" | "error";
};

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  children,
  ...props
}: PromptInputSubmitProps) => {
  let icon = <CornerDownLeftIcon className="size-4" />;
  if (status === "submitted") icon = <Spinner />;

  return (
    <InputGroupButton
      aria-label="Send question"
      className={cn(className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}
    >
      {children ?? icon}
    </InputGroupButton>
  );
};
