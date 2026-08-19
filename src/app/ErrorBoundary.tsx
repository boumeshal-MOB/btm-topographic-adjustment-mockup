import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorFallback } from '@/app/ErrorFallback';

interface Props {
  children: ReactNode;
  /**
   * Names the section, so a contained failure says *which* panel broke instead of replacing the
   * screen with a generic page. Without it the boundary behaves as the shell-wide one.
   */
  label?: string;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Contains a render failure.
 *
 * At the shell level it replaces the application. Placed around a panel — with a `label` — it keeps
 * the surrounding screen and its state alive: a bad payload in one section of the Analysis Lab used
 * to reach the route boundary and take the whole workspace down, losing every trial the surveyor
 * had built. Resetting re-renders the panel without reloading the page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in topographic adjustment shell', error, info);
  }

  private readonly reset = () => this.setState({ hasError: false, message: undefined });

  override render() {
    if (this.state.hasError) {
      return this.props.label === undefined
        ? <ErrorFallback />
        : (
          <ErrorFallback
            label={this.props.label}
            message={this.state.message}
            onRetry={this.reset}
          />
        );
    }
    return this.props.children;
  }
}
