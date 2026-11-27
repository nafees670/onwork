import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ROLES, THEME_PREFERENCES, type PublicUser } from '@video-lamhe/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: null },
    passwordHash: { type: String, required: true, select: false },
    googleId: { type: String, unique: true, sparse: true },
    avatarUrl: { type: String, default: null },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    isEmailVerified: { type: Boolean, default: false },
    /** Bumped to invalidate every refresh token of this user (logout-all / reuse detected / password reset). */
    refreshTokenVersion: { type: Number, default: 0 },
    themePreference: { type: String, enum: THEME_PREFERENCES, default: 'light' },
    passwordResetTokenHash: { type: String, select: false, default: null },
    passwordResetExpiresAt: { type: Date, select: false, default: null },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);

export function toPublicUser(u: UserDoc): PublicUser {
  return {
    id: u.id as string,
    name: u.name,
    email: u.email,
    phone: u.phone ?? '',
    role: u.role,
    avatarUrl: u.avatarUrl ?? null,
    themePreference: u.themePreference,
    isEmailVerified: u.isEmailVerified,
  };
}
