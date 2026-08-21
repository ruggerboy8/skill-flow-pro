import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

interface Props {
  children: ReactNode;
}

/**
 * What kind of error the boundary is showing, decided once at catch time:
 * - 'chunk-offline': a lazy route's chunk failed to load and the browser was
 *   offline at that moment. Most likely cause of the failure is the missing
 *   network, not a stale build, so "New Version Available" would be
 *   misleading here.
 * - 'chunk-update': a lazy route's chunk failed to load while online -- the
 *   original case this boundary was built for (a stale client after a new
 *   deploy references a chunk that no longer exists).
 * - 'generic': anything else.
 */
type RouteErrorKind = 'chunk-offline' | 'chunk-update' | 'generic';

interface State {
  hasError: boolean;
  errorKind: RouteErrorKind;
}

/**
 * Pure classification, extracted so it's testable without mounting a
 * component or throwing a real error. `isOnline` is threaded in as a plain
 * boolean rather than read from `navigator.onLine` here, so this stays a
 * pure function; the boundary itself reads `navigator.onLine` at the actual
 * moment of the error (see getDerivedStateFromError below) and passes it in.
 */
export function classifyRouteError(error: Pick<Error, 'message' | 'name'>, isOnline: boolean): RouteErrorKind {
  const isChunkError =
    error.message?.includes('dynamically imported module') ||
    error.message?.includes('Importing a module script failed') ||
    error.message?.includes('Failed to fetch dynamically imported module') ||
    error.message?.includes('Loading chunk') ||
    error.name === 'ChunkLoadError';

  if (!isChunkError) return 'generic';
  return isOnline ? 'chunk-update' : 'chunk-offline';
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorKind: 'generic' };
  }

  static getDerivedStateFromError(error: Error): State {
    // Read online status at the moment the error is caught, not later --
    // by the time a person reads the fallback UI they may have reconnected,
    // but the classification should reflect what actually caused this load
    // to fail, not the state after the fact.
    return { hasError: true, errorKind: classifyRouteError(error, navigator.onLine) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RouteErrorBoundary caught error:', error, errorInfo);
  }

  handleRefresh = () => {
    // LOOP GUARD: Check if we just reloaded
    const storageKey = 'app_reload_timestamp';
    const lastReload = sessionStorage.getItem(storageKey);
    const now = Date.now();

    if (lastReload && now - parseInt(lastReload) < 10000) {
      console.error('Reload loop detected. Please try again in a few seconds.');
      // Reset error state to show the error UI instead of looping
      this.setState({ hasError: true, errorKind: 'generic' });
      return;
    }

    sessionStorage.setItem(storageKey, now.toString());
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { errorKind } = this.state;
      const isOffline = errorKind === 'chunk-offline';

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              {isOffline ? (
                <WifiOff className="w-8 h-8 text-muted-foreground" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-muted-foreground" />
              )}
            </div>

            {errorKind === 'chunk-offline' ? (
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  You appear to be offline
                </h1>
                <p className="text-muted-foreground">
                  We couldn't load this page without a connection. Check your Wi-Fi or
                  data, then try again.
                </p>
              </div>
            ) : errorKind === 'chunk-update' ? (
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  New Version Available
                </h1>
                <p className="text-muted-foreground">
                  The app has been updated. Please refresh to get the latest version.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">
                  Something went wrong
                </h1>
                <p className="text-muted-foreground">
                  We encountered an unexpected error. Please try refreshing the page.
                </p>
              </div>
            )}

            <Button onClick={this.handleRefresh} size="lg" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              {isOffline ? 'Try Again' : 'Refresh Page'}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
