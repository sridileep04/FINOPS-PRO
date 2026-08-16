import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Zap, User, Shield } from 'lucide-react';
import { motion } from 'motion/react';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'viewer' | 'admin'>('viewer');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        if (name.trim().length < 2) {
            setError('Name must be at least 2 characters.');
            setIsLoading(false);
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/v1/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, role }),
            });

            const data = await response.json();

            if (response.ok) {
                login(data.token, data.user);
                navigate('/dashboard');
            } else {
                setError(data.detail || 'Registration failed');
            }
        } catch (err) {
            setError('An error occurred during registration. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-brand-base text-brand-text flex items-center justify-center p-4">
            {/* Background radial gradients for ambient glassmorphic feel */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-indigo-500/5 blur-[100px] rounded-full" />
                <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-purple-500/5 blur-[100px] rounded-full" />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md relative z-10"
            >
                <div className="flex justify-center mb-8">
                    <Link to="/" className="flex items-center gap-2 text-brand-content font-bold text-xl tracking-tight hover:opacity-90 transition-opacity">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-md flex items-center justify-center">
                            <Zap className="h-5 w-5 text-brand-content" />
                        </div>
                        GHOST <span className="text-indigo-400">FINOPS</span>
                    </Link>
                </div>

                <Card className="border-brand-content/10 shadow-2xl shadow-indigo-500/10 backdrop-blur-md bg-black/40">
                    <CardHeader>
                        <CardTitle>Create your account</CardTitle>
                        <CardDescription>Get instant access to autonomous cost intelligence</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-brand-content/40 uppercase tracking-widest">Full Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-brand-surface border border-brand-content/10 rounded-lg px-4 py-2 text-sm text-brand-content focus:outline-none focus:border-indigo-500/50 transition-colors"
                                    placeholder="Alex Rivera"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-brand-content/40 uppercase tracking-widest">Email Address</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-brand-surface border border-brand-content/10 rounded-lg px-4 py-2 text-sm text-brand-content focus:outline-none focus:border-indigo-500/50 transition-colors"
                                    placeholder="alex@company.com"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-brand-content/40 uppercase tracking-widest">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-brand-surface border border-brand-content/10 rounded-lg px-4 py-2 text-sm text-brand-content focus:outline-none focus:border-indigo-500/50 transition-colors"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-brand-content/40 uppercase tracking-widest block mb-1">
                                    Access Level (RBAC)
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setRole('viewer')}
                                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${role === 'viewer'
                                            ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400 shadow-inner'
                                            : 'bg-brand-surface border-brand-content/10 text-brand-content/60 hover:text-brand-content hover:border-brand-content/20'
                                            }`}
                                    >
                                        <User className="h-3.5 w-3.5" />
                                        Viewer (Read-Only)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRole('admin')}
                                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${role === 'admin'
                                            ? 'bg-purple-600/10 border-purple-500 text-purple-400 shadow-inner'
                                            : 'bg-brand-surface border-brand-content/10 text-brand-content/60 hover:text-brand-content hover:border-brand-content/20'
                                            }`}
                                    >
                                        <Shield className="h-3.5 w-3.5" />
                                        Admin (Full Control)
                                    </button>
                                </div>
                                <p className="text-[10px] text-brand-content/30 leading-normal mt-1">
                                    {role === 'admin'
                                        ? 'Admins can manage Cloud integrations, optimize resources, and run automated recommendations.'
                                        : 'Viewers get read-only access to Cost Mountain charts, daily trends, and AI Copilot explanations.'}
                                </p>
                            </div>

                            <Button type="submit" className="w-full mt-4" disabled={isLoading}>
                                {isLoading ? 'Creating Account...' : 'Get Started Free'}
                            </Button>

                            <div className="mt-4 pt-4 border-t border-brand-content/5 text-xs text-brand-content/40 text-center">
                                Already have an account?{' '}
                                <Link to="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
                                    Sign in
                                </Link>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
