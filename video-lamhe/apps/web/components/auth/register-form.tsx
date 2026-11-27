'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { registerSchema } from '@video-lamhe/shared';
import { GoogleButton } from '@/components/auth/google-button';
import { Button, FormAlert, Input } from '@/components/ui';
import { register as registerUser } from '@/lib/api/auth';
import { applyServerError } from '@/lib/forms';

type In = z.input<typeof registerSchema>;
type Out = z.output<typeof registerSchema>;

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<In, unknown, Out>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerUser(values);
      onSuccess();
    } catch (err) {
      applyServerError(err, setError, { EMAIL_TAKEN: 'email' });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert>{errors.root?.server?.message}</FormAlert>
      <Input
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0300 1234567"
        hint="Operators reach you here. Never shown publicly."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" size="lg" loading={isSubmitting} className="mt-2">
        Create account
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton />
      {/* TODO(Phase 9): link to /terms and /privacy once the static pages exist. */}
      <p className="text-center text-xs text-muted">
        By creating an account you agree to our Terms and Privacy Policy.
      </p>
    </form>
  );
}
