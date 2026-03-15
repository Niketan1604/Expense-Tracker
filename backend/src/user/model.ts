export interface UserProfile {
  PK: string;
  SK: string;
  userId: string;
  email: string;
  name: string;
  currency: string;  // ISO 4217 e.g. 'INR', 'USD'
  createdAt: string; // ISO 8601 — set once on creation, never updated
  updatedAt: string; // ISO 8601 — updated on every PUT
}

export const userProfileKey = (userId: string) => ({
  PK: `USER#${userId}`,
  SK: 'PROFILE'
});