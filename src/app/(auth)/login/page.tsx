import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
    title: 'Sign in — MeasureX',
    description: 'Sign in to your MeasureX account.',
};

interface LoginPageProps {
    searchParams: {
        error?: string;
        callbackUrl?: string;
    };
}

const ERROR_MESSAGES: Record<string, string> = {
    OAuthSignin: 'Could not start the sign-in flow. Please try again.',
    OAuthCallback: 'Something went wrong during sign-in. Please try again.',
    OAuthCreateAccount: 'Could not create your account. Please try again.',
    EmailCreateAccount: 'Could not create your account. Please try again.',
    Callback: 'Something went wrong. Please try again.',
    OAuthAccountNotLinked:
        'This email is already linked to a different sign-in method.',
    EmailSignin: 'Failed to send the magic link. Please try again.',
    CredentialsSignin: 'Invalid credentials. Please try again.',
    SessionRequired: 'Please sign in to access that page.',
    Default: 'An error occurred during sign-in. Please try again.',
};

function getErrorMessage(error?: string): string | null {
    if (!error) return null;
    return ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default;
}

/**
 * Login page — server component.
 * Checks env vars server-side so we never expose them to the client bundle.
 */
export default function LoginPage({ searchParams }: LoginPageProps) {
    const errorMessage = getErrorMessage(searchParams.error);
    const callbackUrl = searchParams.callbackUrl ?? '/dashboard';

    // Google OAuth is optional — only show the button when credentials are set
    const showGoogle = Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    );

    return (
        <main className="min-h-screen bg-white flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                {/* Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Brand gradient accent bar */}
                    <div className="h-1.5 bg-brand-gradient" aria-hidden="true" />

                    <div className="px-8 py-8">
                        {/* Logo / wordmark */}
                        <div className="flex items-center gap-2 mb-8">
                            <div
                                className="w-8 h-8 rounded-lg bg-brand-gradient flex items-center justify-center flex-shrink-0"
                                aria-hidden="true"
                            >
                                <svg
                                    className="w-4 h-4 text-white"
                                    viewBox="0 0 16 16"
                                    fill="currentColor"
                                >
                                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 2a3 3 0 100 6 3 3 0 000-6z" />
                                </svg>
                            </div>
                            <span className="text-lg font-semibold text-slate-900 tracking-tight">
                                MeasureX
                            </span>
                        </div>

                        {/* Heading */}
                        <div className="mb-6">
                            <h1 className="text-xl font-semibold text-slate-900">
                                Sign in to MeasureX
                            </h1>
                            <p className="mt-1 text-sm text-slate-500">
                                Track your brand across AI answer engines.
                            </p>
                        </div>

                        {/* Error banner */}
                        {errorMessage && (
                            <div
                                role="alert"
                                className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
                            >
                                {errorMessage}
                            </div>
                        )}

                        {/* Login form (client component) */}
                        <LoginForm callbackUrl={callbackUrl} showGoogle={showGoogle} />
                    </div>
                </div>

                {/* Footer note */}
                <p className="mt-6 text-center text-xs text-slate-400">
                    By signing in you agree to our{' '}
                    <a href="/terms" className="underline hover:text-slate-600 transition-colors">
                        Terms
                    </a>{' '}
                    and{' '}
                    <a href="/privacy" className="underline hover:text-slate-600 transition-colors">
                        Privacy Policy
                    </a>
                    .
                </p>
            </div>
        </main>
    );
}
