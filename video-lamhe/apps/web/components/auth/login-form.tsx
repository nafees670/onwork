'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { loginSchema } from '@video-lamhe/shared';
import { GoogleButton } from '@/components/auth/google-button';
import { Button, FormAlert, Input } from '@/components/ui';
import { login } from '@/lib/api/auth';
import { applyServerError } from '@/lib/forms';

const GOOGLE_ERRORS: Record<string, string> = {
  NOT_CONFIGURED: 'Google sign-in is not available yet.',
  INVALID_STATE: 'Google sign-in expired. Please try again.',
  GOOGLE_DENIED: 'Google sign-in was cancelled.',
  EMAIL_NOT_VERIFIED: 'Please use a verified Google email address.',
  ACCOUNT_CONFLICT: 'This email is linked to a different Google account.',
  GOOGLE_FAILED: 'Google sign-in failed. Please try again.',
};

type In = z.input<typeof loginSchema>;
type Out = z.output<typeof loginSchema>;

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<In, unknown, Out>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      onSuccess();
    } catch (err) {
      applyServerError(err, setError);
    }
  });

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('googleError');
    if (!reason) return;
    setError('root.server', {
      message: GOOGLE_ERRORS[reason] ?? 'Google sign-in failed. Please try again.',
    });
    window.history.replaceState({}, '', window.location.pathname);
  }, [setError]);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert>{errors.root?.server?.message}</FormAlert>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Link
        href="/forgot-password"
        className="-mt-1 w-fit text-sm text-gold-text underline-offset-4 hover:underline"
      >
        Forgot password?
      </Link>
      <Button type="submit" size="lg" loading={isSubmitting} className="mt-2">
        Log in
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton />
    </form>
  );
}
