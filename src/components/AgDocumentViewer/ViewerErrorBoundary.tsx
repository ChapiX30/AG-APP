import React from "react";

type Props = {
  fallback: React.ReactNode;
  children: React.ReactNode;
};

type State = { hasError: boolean };

export class ViewerErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[AgDocumentViewer]", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
