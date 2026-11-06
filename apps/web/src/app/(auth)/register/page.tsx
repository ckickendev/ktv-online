'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, User, Mail, Lock } from 'lucide-react';
import { GuestOnlyRoute } from '@/components/auth/guest-only-route';
import { AuthLayout } from '@/components/auth/auth-layout';
import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api/errors';

const RegisterFormSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Username can only contain letters, numbers, underscores, and dashes'
      ),
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(100, 'Password cannot exceed 100 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof RegisterFormSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterFormSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);

    try {
      await registerUser(
        {
          username: data.username,
          email: data.email,
          password: data.password,
        },
        true // Automatically establish authenticated session upon registration
      );

      setIsSuccess(true);
      router.replace('/rooms');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setServerError(err.message || 'Email or username is already taken');
          return;
        }
        if (err.details && err.details.length > 0) {
          setServerError(err.details.map((d) => d.message).join('. '));
          return;
        }
        setServerError(err.message);
        return;
      }
      setServerError('An unexpected error occurred during registration. Please try again.');
    }
  };

  return (
    <GuestOnlyRoute>
      <AuthLayout
        title="Claim Your Stage Name"
        subtitle="Create your KTV Online profile to host virtual lounges, belt out tracks, and party with friends."
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
            <div className="flex-1 font-medium">Account created! Entering the lounges...</div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* Username Field */}
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-xs font-semibold text-slate-300">
              Stage Name (Username)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="vocal_legend99"
                {...register('username')}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0b0e19] border text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  errors.username
                    ? 'border-red-500/60 focus:border-red-500'
                    : 'border-white/10 focus:border-violet-500'
                }`}
              />
            </div>
            {errors.username && (
              <p className="text-[11px] text-red-400 font-medium pl-1">{errors.username.message}</p>
            )}
          </div>

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
            <label htmlFor="password" className="block text-xs font-semibold text-slate-300">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
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

          {/* Confirm Password Field */}
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-300">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat your password"
                {...register('confirmPassword')}
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#0b0e19] border text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  errors.confirmPassword
                    ? 'border-red-500/60 focus:border-red-500'
                    : 'border-white/10 focus:border-violet-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-[11px] text-red-400 font-medium pl-1">
                {errors.confirmPassword.message}
              </p>
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
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/5 text-center text-xs text-slate-400">
          Already have a stage name?{' '}
          <Link
            href="/login"
            className="font-semibold text-violet-400 hover:text-violet-300 underline underline-offset-4 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </AuthLayout>
    </GuestOnlyRoute>
  );
}
