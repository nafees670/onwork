import { z } from 'zod';

export const ROLES = ['customer', 'operator', 'admin'] as const;
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export const EVENT_TYPES = [
  { value: 'mehndi', label: 'Mehndi' },
  { value: 'barat', label: 'Barat' },
  { value: 'walima', label: 'Walima' },
  { value: 'nikah', label: 'Nikah' },
  { value: 'outdoor', label: 'Outdoor / Pre-wedding shoot' },
  { value: 'other', label: 'Other' },
] as const;
export const EVENT_TYPE_VALUES = EVENT_TYPES.map((e) => e.value);
export const WHATSAPP_ROUTINGS = ['admin', 'operator'] as const;
export const CONTACT_ACTIONS = [
  'chat',
  'whatsapp',
  'call',
  'book',
  'inquiry',
  'like',
  'save',
] as const;
export const DEFAULT_CONTACT_SETTINGS = {
  welcomeTitle: 'Welcome to Video Lamhe! 👋 Aap ko kya chahiye?',
  welcomeSubtitle: 'What do you need?',
  eventOptions: EVENT_TYPES.map((e) => ({ value: e.value, label: e.label })),
};
export const OPERATOR_STATUSES = ['pending', 'active', 'inactive'] as const;
export const PROVINCES = [
  'Punjab',
  'Sindh',
  'Khyber Pakhtunkhwa',
  'Balochistan',
  'Islamabad Capital Territory',
  'Gilgit-Baltistan',
  'Azad Jammu & Kashmir',
] as const;
export const OPERATOR_SORTS = [
  'recommended',
  'rating',
  'price_asc',
  'price_desc',
  'experience',
] as const;
export const DRONE_SORTS = ['popular', 'price_asc', 'price_desc', 'name'] as const;
export const SHORT_STATUSES = ['draft', 'pending', 'published', 'rejected'] as const;
export const UPLOAD_TYPES = ['short', 'avatar', 'drone', 'hero'] as const;
export const MEDIA_LIMITS = {
  shortMaxSeconds: 60,
  shortMaxBytes: 100 * 1024 * 1024,
  imageMaxBytes: 10 * 1024 * 1024,
};
export const SEED_CITIES = [
  { name: 'Karachi', slug: 'karachi', province: 'Sindh' },
  { name: 'Lahore', slug: 'lahore', province: 'Punjab' },
  { name: 'Islamabad', slug: 'islamabad', province: 'Islamabad Capital Territory' },
  { name: 'Rawalpindi', slug: 'rawalpindi', province: 'Punjab' },
  { name: 'Faisalabad', slug: 'faisalabad', province: 'Punjab' },
  { name: 'Multan', slug: 'multan', province: 'Punjab' },
  { name: 'Peshawar', slug: 'peshawar', province: 'Khyber Pakhtunkhwa' },
  { name: 'Hyderabad', slug: 'hyderabad', province: 'Sindh' },
  { name: 'Quetta', slug: 'quetta', province: 'Balochistan' },
  { name: 'Sialkot', slug: 'sialkot', province: 'Punjab' },
  { name: 'Gujranwala', slug: 'gujranwala', province: 'Punjab' },
  { name: 'Sukkur', slug: 'sukkur', province: 'Sindh' },
];

export type Role = (typeof ROLES)[number];
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type EventType = (typeof EVENT_TYPES)[number]['value'];
export type WhatsappRouting = (typeof WHATSAPP_ROUTINGS)[number];
export type ContactAction = (typeof CONTACT_ACTIONS)[number];
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number];
export type OperatorSort = (typeof OPERATOR_SORTS)[number];
export type DroneSort = (typeof DRONE_SORTS)[number];
export type ShortStatus = (typeof SHORT_STATUSES)[number];
export type UploadType = (typeof UPLOAD_TYPES)[number];

export function toWaNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

export function waLink(phone: string, message?: string): string {
  const number = toWaNumber(phone);
  if (!number) throw new Error('Invalid WhatsApp number');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${number}${text}`;
}

export function buildWaMessage(input: {
  eventLabel?: string;
  operatorName?: string;
  droneName?: string;
  cityName?: string;
  date?: string;
  note?: string;
}): string {
  const greeting = input.eventLabel
    ? `Assalam o Alaikum! Mujhe ${input.eventLabel} ke liye drone shoot chahiye.`
    : 'Assalam o Alaikum! Mujhe drone shoot chahiye.';
  const details = [
    input.operatorName && `Operator: ${input.operatorName}`,
    input.droneName && `Drone: ${input.droneName}`,
    input.cityName && `City: ${input.cityName}`,
    input.date && `Date: ${input.date}`,
  ].filter(Boolean);
  const lines = [greeting];
  if (details.length) lines.push(details.join(' · '));
  if (input.note?.trim()) lines.push(`Note: ${input.note.trim()}`);
  lines.push('(Video Lamhe website)');
  return lines.join('\n');
}

export function patchSchema<T extends z.ZodRawShape>(
  shape: T,
): z.ZodType<Partial<z.output<z.ZodObject<T>>>, Partial<z.input<z.ZodObject<T>>>> {
  const mapped: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(shape)) {
    const f = field as z.ZodTypeAny;
    mapped[key] =
      f instanceof z.ZodDefault ? (f.unwrap() as z.ZodTypeAny).optional() : f.optional();
  }
  return z.object(mapped).refine((v) => Object.keys(v).length > 0, {
    message: 'Nothing to update',
  }) as unknown as z.ZodType<Partial<z.output<z.ZodObject<T>>>, Partial<z.input<z.ZodObject<T>>>>;
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }));
const pkMobileSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .transform((v, ctx) => {
    const n = toWaNumber(v);
    if (!n || !/^923\d{9}$/.test(n)) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid mobile number, e.g. 0300 1234567' });
      return z.NEVER;
    }
    return n;
  });
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');
const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters');
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

export const registerSchema = z.object({
  name: nameSchema,
  phone: pkMobileSchema,
  email: emailSchema,
  password: passwordSchema,
});
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export const updateMeSchema = z
  .object({ name: nameSchema, phone: pkMobileSchema, themePreference: z.enum(THEME_PREFERENCES) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const whatsappContactSchema = z.object({
  operatorSlug: z.string().trim().max(120).optional(),
  operatorName: z.string().trim().min(1).max(80).optional(),
  droneName: z.string().trim().min(1).max(80).optional(),
  cityName: z.string().trim().min(1).max(80).optional(),
  eventType: z.enum(EVENT_TYPE_VALUES).optional(),
  eventDate: isoDateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();
const httpsUrl = z.url({ protocol: /^https?$/ }).max(500);
const optionalUrl = z
  .union([httpsUrl, z.literal('')])
  .transform((v) => v || undefined)
  .optional();
const cloudinaryUrlSchema = z
  .url({ protocol: /^https$/, hostname: /^res\.cloudinary\.com$/ })
  .max(500);
const optionalCloudinaryUrl = z
  .union([cloudinaryUrlSchema, z.literal('')])
  .transform((v) => v || undefined)
  .optional();
const priceSchema = z.coerce.number().int().min(0).max(1e7);
const optionalPrice = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  priceSchema.optional(),
);
const queryPage = z.coerce.number().int().min(1).max(1e3).default(1);
const queryLimit = (def: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(def);
const queryText = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((v) => v || undefined);
const cityShape = {
  name: z.string().trim().min(2).max(60),
  slug: slugSchema.optional(),
  province: z.enum(PROVINCES),
  isActive: z.boolean().default(true),
};
export const cityCreateSchema = z.object(cityShape);
export const cityUpdateSchema = patchSchema(cityShape);
const droneSpecsSchema = z.object({
  camera: z.string().trim().max(120).default(''),
  video: z.string().trim().max(120).default(''),
  flightTime: z.string().trim().max(60).default(''),
  range: z.string().trim().max(60).default(''),
});
const droneModelShape = {
  name: z.string().trim().min(2).max(60),
  slug: slugSchema.optional(),
  tag: optionalText(30),
  bestFor: optionalText(300),
  specs: droneSpecsSchema.default({ camera: '', video: '', flightTime: '', range: '' }),
  images: z.array(cloudinaryUrlSchema).max(6).default([]),
  sortOrder: z.coerce.number().int().min(0).max(1e3).default(0),
};
export const droneModelCreateSchema = z.object(droneModelShape);
export const droneModelUpdateSchema = patchSchema(droneModelShape);
const socialLinksSchema = z
  .object({
    instagram: optionalUrl,
    facebook: optionalUrl,
    youtube: optionalUrl,
    tiktok: optionalUrl,
    website: optionalUrl,
  })
  .default({});
const operatorDronePriceShape = {
  pricePerEvent: optionalPrice,
  pricePerHour: optionalPrice,
  isAvailable: z.boolean().default(true),
};
export const operatorDroneInputSchema = z.object({
  model: objectIdSchema,
  ...operatorDronePriceShape,
});
export const operatorDroneUpdateSchema = patchSchema(operatorDronePriceShape);
const operatorProfileShape = {
  businessName: z.string().trim().min(2).max(80),
  bio: optionalText(2e3),
  photoUrl: optionalCloudinaryUrl,
  baseCity: objectIdSchema,
  serviceCities: z.array(objectIdSchema).max(30).default([]),
  phone: pkMobileSchema,
  whatsapp: z
    .union([pkMobileSchema, z.literal('')])
    .transform((v) => v || undefined)
    .optional(),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
  socialLinks: socialLinksSchema,
};
export const operatorSelfUpdateSchema = patchSchema(operatorProfileShape);
export const operatorRegisterSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  ...operatorProfileShape,
});
export const adminOperatorCreateSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  ...operatorProfileShape,
  status: z.enum(OPERATOR_STATUSES).default('active'),
  isVerified: z.boolean().default(false),
  drones: z.array(operatorDroneInputSchema).max(20).default([]),
});
export const adminOperatorUpdateSchema = patchSchema({
  ...operatorProfileShape,
  isVerified: z.boolean(),
});
export const operatorStatusUpdateSchema = z.object({ status: z.enum(OPERATOR_STATUSES) });
export const operatorDronesReplaceSchema = z.object({
  drones: z.array(operatorDroneInputSchema).max(20),
});
export const operatorListQuerySchema = z.object({
  city: slugSchema.optional(),
  drone: slugSchema.optional(),
  event: z.enum(EVENT_TYPE_VALUES).optional(),
  q: queryText,
  sort: z.enum(OPERATOR_SORTS).default('recommended'),
  page: queryPage,
  limit: queryLimit(12, 48),
});
export const droneListQuerySchema = z.object({
  city: slugSchema.optional(),
  event: z.enum(EVENT_TYPE_VALUES).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1e7).optional(),
  sort: z.enum(DRONE_SORTS).default('popular'),
});
export const droneDetailQuerySchema = z.object({ city: slugSchema.optional() });
export const adminOperatorListQuerySchema = z.object({
  city: objectIdSchema.optional(),
  status: z.enum(OPERATOR_STATUSES).optional(),
  q: queryText,
  page: queryPage,
  limit: queryLimit(20, 100),
});

const cloudinaryPublicIdSchema = z
  .string()
  .trim()
  .max(255)
  .regex(/^video-lamhe\/[a-z]+\/[a-f\d]{24}\/[\w-]+$/i, 'Invalid upload id');
export const uploadSignatureQuerySchema = z.object({ type: z.enum(UPLOAD_TYPES) });
const shortMetaShape = {
  title: z.string().trim().min(3).max(80),
  caption: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || undefined)
    .optional(),
  city: objectIdSchema,
  droneModel: z
    .union([objectIdSchema, z.literal('')])
    .transform((v) => v || undefined)
    .optional(),
  eventType: z.enum(EVENT_TYPE_VALUES),
};
export const shortCreateSchema = z.object({
  publicId: cloudinaryPublicIdSchema,
  ...shortMetaShape,
});
export const shortUpdateSchema = patchSchema(shortMetaShape);
export const adminShortCreateSchema = z.object({
  publicId: cloudinaryPublicIdSchema,
  operator: objectIdSchema,
  ...shortMetaShape,
  status: z.enum(['draft', 'published']).default('published'),
  isFeatured: z.boolean().default(false),
});
export const adminShortUpdateSchema = patchSchema({
  ...shortMetaShape,
  status: z.enum(SHORT_STATUSES),
  isFeatured: z.boolean(),
  rejectionReason: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || undefined)
    .optional(),
});
export const shortFeedQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  city: slugSchema.optional(),
  event: z.enum(EVENT_TYPE_VALUES).optional(),
  drone: slugSchema.optional(),
  operator: slugSchema.optional(),
  featured: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(24).default(8),
});
export const adminShortListQuerySchema = z.object({
  status: z.enum(SHORT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1e3).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type UpdateMeInput = z.input<typeof updateMeSchema>;
export type WhatsappContactInput = z.input<typeof whatsappContactSchema>;
export type CityCreateInput = z.input<typeof cityCreateSchema>;
export type CityUpdateInput = z.output<typeof cityUpdateSchema>;
export type DroneModelCreateInput = z.input<typeof droneModelCreateSchema>;
export type DroneModelUpdateInput = z.output<typeof droneModelUpdateSchema>;
export type OperatorRegisterInput = z.input<typeof operatorRegisterSchema>;
export type OperatorSelfUpdateInput = z.output<typeof operatorSelfUpdateSchema>;
export type AdminOperatorCreateInput = z.input<typeof adminOperatorCreateSchema>;
export type AdminOperatorUpdateInput = z.output<typeof adminOperatorUpdateSchema>;
export type AdminOperatorListQuery = z.input<typeof adminOperatorListQuerySchema>;
export type OperatorDroneInput = z.input<typeof operatorDroneInputSchema>;
export type ShortCreateInput = z.input<typeof shortCreateSchema>;
export type ShortUpdateInput = z.output<typeof shortUpdateSchema>;
export type AdminShortCreateInput = z.input<typeof adminShortCreateSchema>;
export type AdminShortUpdateInput = z.output<typeof adminShortUpdateSchema>;
export type AdminShortListQuery = z.input<typeof adminShortListQuerySchema>;

export interface CityRef {
  id: string;
  name: string;
  slug: string;
}
export interface DroneModelRef {
  id: string;
  name: string;
  slug: string;
  tag: string | null;
}
export interface OperatorDroneOffer {
  id: string;
  model: DroneModelRef;
  pricePerEvent: number | null;
  pricePerHour: number | null;
  isAvailable: boolean;
}
export interface PublicOperatorCard {
  id: string;
  slug: string;
  businessName: string;
  photoUrl: string | null;
  baseCity: CityRef;
  serviceCities: CityRef[];
  experienceYears: number;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  hasWhatsapp: boolean;
  priceFrom: number | null;
  drones: OperatorDroneOffer[];
}
export interface PublicOperator extends PublicOperatorCard {
  bio: string | null;
  socialLinks: Record<string, string | undefined>;
  memberSince: string;
}
export interface ManagedOperator extends PublicOperator {
  status: OperatorStatus;
  phone: string;
  whatsapp: string;
  owner: { id: string; name: string; email: string };
  createdAt: string;
}
export interface AdminCity extends CityRef {
  province: string;
  isActive: boolean;
  operatorCount: number;
}
export interface PublicCity extends CityRef {
  province: string;
  operatorCount: number;
}
export interface DroneSpecs {
  camera: string;
  video: string;
  flightTime: string;
  range: string;
}
export interface AdminDroneModel extends DroneModelRef {
  bestFor: string | null;
  specs: DroneSpecs;
  images: string[];
  sortOrder: number;
  priceFrom: number | null;
  operatorCount: number;
}
export type PublicDroneModel = Omit<AdminDroneModel, 'sortOrder'>;
export interface DroneDetail {
  model: PublicDroneModel;
  offers: Array<PublicOperatorCard & { offer: OperatorDroneOffer }>;
}
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
export interface ShortFeedMeta {
  nextCursor: string | null;
}
export interface PublicShort {
  id: string;
  title: string;
  caption: string | null;
  eventType: EventType;
  videoUrl: string;
  thumbnailUrl: string;
  durationSec: number;
  likeCount: number;
  views: number;
  isFeatured: boolean;
  operator: {
    id: string;
    slug: string;
    businessName: string;
    photoUrl: string | null;
    isVerified: boolean;
  };
  city: CityRef;
  droneModel: DroneModelRef | null;
  createdAt: string;
}
export interface ManagedShort extends PublicShort {
  status: ShortStatus;
  rejectionReason: string | null;
  operatorInactive: boolean;
}
export interface ShortEngagement {
  liked: string[];
  saved: string[];
  likeCount?: Record<string, number>;
}
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  avatarUrl: string | null;
  themePreference: ThemePreference;
  isEmailVerified: boolean;
}
export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
}
export interface ContactSettings {
  welcomeTitle: string;
  welcomeSubtitle: string;
  eventOptions: Array<{ value: string; label: string }>;
}
export interface OperatorContactResult {
  phone: string;
  whatsapp: string;
  waLink: string;
  routedTo: WhatsappRouting;
}
export interface WhatsappContactResult {
  whatsapp: string;
  waLink: string;
}
export interface UploadSignature {
  type: UploadType;
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: string;
  maxBytes: number;
  maxSeconds?: number;
}
export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  duration?: number;
  bytes?: number;
}
export interface ApiSuccess<T> {
  data: T;
  meta?: unknown;
}
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
export interface HealthStatus {
  status: 'ok';
  uptime: number;
  timestamp: string;
}
export interface ReadyStatus {
  status: 'ready' | 'not_ready';
  checks: {
    mongo: 'up' | 'down';
    redis: 'up' | 'down' | 'skipped';
  };
}
