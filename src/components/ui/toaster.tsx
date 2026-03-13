import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react"

const variantIcons = {
  default: <CheckCircle2 className="h-5 w-5 shrink-0 text-[hsl(var(--status-complete))]" />,
  destructive: <XCircle className="h-5 w-5 shrink-0 text-destructive-foreground" />,
  warning: <AlertTriangle className="h-5 w-5 shrink-0 text-[hsl(var(--warning))]" />,
} as const;

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={2000}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const icon = variantIcons[variant || "default"];
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex items-start gap-3">
              {icon}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
