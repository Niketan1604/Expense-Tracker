import { z } from 'zod';

// =========================================================
// Category Model
//
// Categories are user-defined — each user manages their own.
// No shared/global categories exist in this design.
//
// categoryId is a ULID-style prefixed ID: cat_{uuid}
// Generated at creation, never changes.
//
// DynamoDB key:
//   PK: USER#{userId}
//   SK: CATEGORY#{categoryId}
// =========================================================

export interface Category {
  categoryId: string;
  userId: string;
  name: string;
  icon?: string;     // emoji or icon identifier
  color?: string;    // hex color e.g. #FF6B6B
  createdAt: string;
  updatedAt: string;
}

// ── Key builders ──────────────────────────────────────────

export const categoryPK = (userId: string) =>
  `USER#${userId}`;

export const categorySK = (categoryId: string) =>
  `CATEGORY#${categoryId}`;

export const categoryKey = (userId: string, categoryId: string) => ({
  PK: categoryPK(userId),
  SK: categorySK(categoryId)
});

// ── ID generator ─────────────────────────────────────────
// Prefixed UUID — readable and sortable in DynamoDB console

export const generateCategoryId = () =>
  `cat_${crypto.randomUUID()}`;

// ── Zod schemas ───────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1, 'name is required').max(50, 'name must be 50 characters or less'),
  icon: z.string().max(10, 'icon must be 10 characters or less').optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'color must be a valid hex color e.g. #FF6B6B').optional()
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
}).refine(
  data => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type CreateCategoryBody = z.infer<typeof createCategorySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;