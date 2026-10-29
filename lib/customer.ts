export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;
export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim().toLowerCase();
}

export function normalizeName(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim().replace(/\s+/g, " ");
}

export function validateEmail(email: string) {
  if (!email) return "Email is required.";
  if (email.length > MAX_EMAIL_LENGTH) return "Email is too long.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";

  return null;
}

export function validateName(name: string) {
  if (!name) return "Name is required.";
  if (name.length > MAX_NAME_LENGTH) return "Name is too long.";

  return null;
}

export function validateNewPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return "Password is too long.";
  }

  return null;
}
