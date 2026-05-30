'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

interface LoginFormProps {
    callbackUrl?: string;
    showGoogle?: boolean;
}

type FormState = 'idle' | 'loading' | 'success' | 'error';

export function LoginForm({ callbackUrl = '/dashboard', showGoogle = false }: LoginFormProps) {
    const [email, setEmail] = useState('');
    const [state, setState] = useState<FormState>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        const trimmed = email.trim();
        if (!trimmed || !trimmed.includes('@')) {
            setErrorMessage('Please enter a valid email address.');
            setState('error');
            return;
        }

        setState('loading');
        setErrorMessage('');

        try {
            const result = await signIn('email', {
                email: trimmed,
                callbackUrl,
                redirect: false,
            });

            if (result?.error) {
                setErrorMessage('Failed to send magic link. Please try again.');
                setState('error');
            } else {
                setState('success');
            }
        } catch {
            setErrorMessage('An unexpected error occurred. Please try again.');
            setState('error');
        }
    }

    async function handleGoogleSignIn() {
        setState('loading');
        setErrorMessage('');
        try {
            await signIn('google', { callbackUrl });
        } catch {
            setErrorMessage('Failed to sign in with Google. Please try again.');
            setState('error');
        }
    }

    if (state === 'success') {
        return (
            <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <svg
                        className="w-6 h-6 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h3 className="text-base font-semibold text-slate-900 mb-1">Check your email</h3>
                <p className="text-sm text-slate-500">
                    We sent a magic link to <span className="font-medium text-slate-700">{email}</span>.
                    Click the link to sign in.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3" noValidate>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Email address
                    </label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (state === 'error') {
                                setState('idle');
                                setErrorMessage('');
                            }
                        }}
                        placeholder="you@company.com"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                        disabled={state === 'loading'}
                        aria-describedby={state === 'error' ? 'email-error' : undefined}
                    />
                </div>

                {state === 'error' && errorMessage && (
                    <p id="email-error" role="alert" className="text-sm text-red-600">
                        {errorMessage}
                    </p>
                )}

                <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={state === 'loading'}
                    aria-busy={state === 'loading'}
                >
                    {state === 'loading' ? (
                        <span className="flex items-center gap-2">
                            <svg
                                className="animate-spin h-4 w-4"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                />
                            </svg>
                            Sending…
                        </span>
                    ) : (
                        'Send magic link'
                    )}
                </Button>
            </form>

            {/* Google OAuth — only rendered when provider is configured */}
            {showGoogle && (
                <>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-slate-200" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-white px-3 text-slate-400">or</span>
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="w-full gap-2"
                        onClick={handleGoogleSignIn}
                        disabled={state === 'loading'}
                    >
                        {/* Google "G" logo */}
                        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                            />
                        </svg>
                        Continue with Google
                    </Button>
                </>
            )}
        </div>
    );
}
