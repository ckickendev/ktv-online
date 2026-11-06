'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, Mail, Lock } from 'lucide-react';
import { GuestOnlyRoute } from '@/components/auth/guest-only-route';
import { AuthLayout } from '@/components/auth/auth-layout';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api/errors';

const LoginFormSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof LoginFormSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const redirectTarget = searchParams.get('redirect');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);

    try {
      await login({
        email: data.email,
        password: data.password,
      });

      setIsSuccess(true);
      const destination = redirectTarget && redirectTarget.startsWith('/') ? redirectTarget : '/rooms';
      router.replace(destination);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setServerError('Invalid email or password. Please check your credentials.');
          return;
        }
        if (err.status === 403) {
          setServerError('Your account is suspended or inactive. Please contact platform support.');
          return;
        }
        if (err.isNetworkError) {
          setServerError('Backend server unreachable. Please check your internet connection.');
          return;
        }
        setServerError(err.message || 'Login failed. Please try again.');
        return;
      }
      setServerError('An unexpected error occurred during login. Please try again.');
    }
  };

  return (
    <GuestOnlyRoute>
      <AuthLayout
        title="Welcome Back, Singer"
        subtitle="Step into your virtual karaoke lounge. Your friends and stage are waiting."
      >
        {serverError && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-3 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{serverError}</div>
          </div>
        )}

        {isSuccess && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">Authentication confirmed! Entering stage...</div>
          </div>
        )}

        {searchParams.get('registered') && !serverError && !isSuccess && (
          <div className="mb-6 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-start gap-3 text-xs text-cyan-300">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">Account created successfully! Please sign in below.</div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Email Field */}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-semibold text-slate-300">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="singer@example.com"
                {...register('email')}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0b0e19] border text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  errors.email
                    ? 'border-red-500/60 focus:border-red-500'
                    : 'border-white/10 focus:border-violet-500'
                }`}
              />
            </div>
            {errors.email && (
              <p className="text-[11px] text-red-400 font-medium pl-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-300">
                Password
              </label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register('password')}
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#0b0e19] border text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  errors.password
                    ? 'border-red-500/60 focus:border-red-500'
                    : 'border-white/10 focus:border-violet-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-[11px] text-red-400 font-medium pl-1">{errors.password.message}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In to Stage</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/5 text-center text-xs text-slate-400">
          New to KTV Online?{' '}
          <Link
            href="/register"
            className="font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-4 transition-colors"
          >
            Claim your stage name
          </Link>
        </div>
      </AuthLayout>
    </GuestOnlyRoute>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-[#090b12]" />}>
      <LoginForm />
    </React.Suspense>
  );
}
