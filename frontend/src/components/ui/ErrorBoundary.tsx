import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Bug } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    private handleReportIssue = () => {
        const body = `Error details:\n\n${this.state.error?.message}\n\nStack trace:\n${this.state.error?.stack}`;
        window.location.href = `mailto:support@aetherfin.com?subject=AetherFin Crash Report&body=${encodeURIComponent(body)}`;
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-brand-base flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-md bg-brand-surface border border-brand-border-strong rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                    >
                        <div className="px-6 py-8 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                                <AlertTriangle className="w-8 h-8 text-red-500" />
                            </div>
                            <h1 className="text-xl font-bold text-brand-content mb-2">Something went wrong</h1>
                            <p className="text-sm text-brand-content/60 mb-8 max-w-[280px]">
                                A critical error occurred in the application view layer. We've caught it to prevent a full page crash.
                            </p>

                            <div className="flex flex-col w-full gap-3">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-brand-content text-brand-base rounded-xl text-sm font-bold hover:bg-brand-content/90 transition-colors"
                                >
                                    <RefreshCcw className="w-4 h-4" />
                                    Reload Application
                                </button>
                                <button
                                    onClick={this.handleReportIssue}
                                    className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-transparent border border-brand-content/20 text-brand-content rounded-xl text-sm font-bold hover:bg-brand-content/5 transition-colors"
                                >
                                    <Bug className="w-4 h-4" />
                                    Report Issue
                                </button>
                            </div>
                        </div>

                        {this.state.error && (
                            <div className="px-6 py-4 bg-brand-surface-alt border-t border-brand-border-strong">
                                <div className="text-[10px] font-bold text-brand-content/40 uppercase tracking-widest mb-2">Error Details</div>
                                <div className="p-3 bg-black/50 rounded-lg overflow-x-auto">
                                    <pre className="text-xs font-mono text-red-400/80 whitespace-pre-wrap break-words">
                                        {this.state.error.toString()}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            );
        }

        return this.props.children;
    }
}
