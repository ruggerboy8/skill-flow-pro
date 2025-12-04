import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const isChunkError = 
      error.message?.includes('dynamically imported module') ||
      error.message?.includes('Importing a module script failed') ||
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Loading chunk') ||
      error.name === 'ChunkLoadError';

    return { hasError: true, isChunkError };
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
      this.setState({ hasError: true, isChunkError: false });
      return;
    }

    sessionStorage.setItem(storageKey, now.toString());
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-6 max-w-md">
            <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-muted-foreground" />
            </div>
            
            {this.state.isChunkError ? (
              <>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold text-foreground">
                    New Version Available
                  </h1>
                  <p className="text-muted-foreground">
                    The app has been updated. Please refresh to get the latest version.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold text-foreground">
                    Something went wrong
                  </h1>
                  <p className="text-muted-foreground">
                    We encountered an unexpected error. Please try refreshing the page.
                  </p>
                </div>
              </>
            )}

            <Button onClick={this.handleRefresh} size="lg" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
