import { Component } from "react";
import { api } from "../services/api";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    api.monitoring
      .reportClientEvent({
        message: error?.message || "Client render error",
        stack: error?.stack || "",
        component_stack: info?.componentStack || "",
        url: window.location.href,
        user_agent: navigator.userAgent
      })
      .catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel">
          <div className="empty-state">
            <strong>Page crashed</strong>
            <span>Reload the page or navigate away. The error has been recorded for review.</span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
