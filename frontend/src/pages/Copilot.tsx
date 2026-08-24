import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BrainCircuit, Send, User, Bot, Code2, CheckCircle2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/context/AuthContext';
import { isSandboxUser } from '@/utils/sandbox';

export default function Copilot() {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState([
        { role: 'assistant', text: "I am Marigold FinOps AI. I can analyze your infrastructure, explain cost anomalies, and generate SQL queries for deeper insights. How can I help?" }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { token, user } = useAuth();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !token) return;

        const userMessage = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setIsLoading(true);

        try {
            // The public sandbox demo account has no real AWS data behind
            // it and shouldn't burn LLM API spend on anonymous traffic --
            // it stays on the deterministic, rule-based endpoint. Any
            // actually logged-in customer gets the LangGraph/RAG endpoint.
            const endpoint = isSandboxUser(user) ? '/api/v1/copilot/chat' : '/api/v1/ai/query';

            // `messages` here is still the state from BEFORE this render's
            // setMessages call above -- i.e. everything already in the
            // conversation, not including the message we're sending now.
            // Without this, the AI endpoint has no memory of earlier turns
            // and can't resolve a short follow-up like an account id or
            // "all" against the question it was actually answering.
            const history = messages.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.text,
            }));

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: userMessage, history })
            });

            const data = await res.json();

            if (res.ok) {
                setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: "Error: Could not connect to AI reasoning engine. " + data.error }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', text: "Error: Connection failed." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-brand-content flex items-center gap-2 uppercase tracking-widest">
                    <span className="flex space-x-0.5">
                        <span className="w-1 h-3 bg-indigo-500 rounded-full"></span>
                        <span className="w-1 h-3 bg-indigo-400 rounded-full"></span>
                    </span>
                    AI Copilot
                </h3>
                <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] rounded uppercase font-bold tracking-widest">GPT-5 Engine</span>
            </div>

            <Card className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {messages.map((msg, i) => (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={i}
                            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                        >
                            <div className={`text-[11px] px-3 py-2 rounded-lg max-w-[90%] ${msg.role === 'user' ? 'bg-indigo-600 text-brand-content rounded-br-none' : 'bg-brand-content/5 border border-brand-content/10 text-brand-content/70 rounded-bl-none'}`}>
                                {msg.role === 'assistant' ? (
                                    <div className="prose prose-invert prose-sm max-w-none">
                                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p>{msg.text}</p>
                                )}
                            </div>
                        </motion.div>
                    ))}
                    {isLoading && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
                            <div className="bg-brand-content/5 border border-brand-content/10 rounded-lg rounded-tl-sm px-3 py-2 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                                <span className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                <span className="h-1.5 w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                            </div>
                        </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-brand-content/5">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                        <div className="relative">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask about your cloud spend..."
                                className="w-full bg-brand-content/5 border border-brand-content/10 rounded-lg px-4 py-3 text-[11px] text-brand-content focus:outline-none focus:border-indigo-500/50 pr-10"
                            />
                            <button type="submit" disabled={isLoading || !input.trim()} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-content/40 hover:text-brand-content transition-colors disabled:opacity-50">
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setInput("Identify waste")} className="px-2 py-1 bg-brand-content/5 border border-brand-content/10 rounded text-[9px] text-brand-content/40 hover:text-brand-content transition-colors">"Identify waste"</button>
                            <button type="button" onClick={() => setInput("Predict Q4 bill")} className="px-2 py-1 bg-brand-content/5 border border-brand-content/10 rounded text-[9px] text-brand-content/40 hover:text-brand-content transition-colors">"Predict Q4 bill"</button>
                        </div>
                    </form>
                </div>
            </Card>
        </div>
    );
}