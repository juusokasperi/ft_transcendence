export type ValidationState = '' | 'valid' | 'invalid' | 'weak';

export interface ValidationResult {
  state: ValidationState;
  msg: string;
}

/**
 * Matches a valid email address.
 * - Must contain one '@' symbol.
 * - No spaces allowed.
 * - Must have at least one character before and after '@', and a domain after '.'.
 */
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Matches a valid username.
 * - May contain letters, numbers, and dashes.
 * - Cannot start or end with a dash.
 * - No spaces or special characters allowed.
 */
export const usernameRegex = /^(?!-)([a-zA-Z0-9-]+)(?<!-)$/;

/**
 * Matches a strong password.
 * Requirements:
 * - At least 12 characters.
 * - At least one lowercase letter.
 * - At least one uppercase letter.
 * - At least one digit.
 * - At least one special character from: !@#$%^&*()-=+[]{};:|,<.>/?`
 */
export const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-=+[\]{};:|,<.>/?`]).{12,}$/;

export const validateEmail = (value: string): boolean => emailRegex.test(value);

export const validateUsername = (value: string): ValidationResult => {
  if (!value) return { state: '', msg: '' };
  if (usernameRegex.test(value)) return { state: 'valid', msg: '' };
  return {
    state: 'invalid',
    msg: 'Username may only contain letters, numbers, and dashes, and cannot start or end with a dash.',
  };
};

export const validatePassword = (value: string): ValidationResult => {
  if (!value) return { state: '', msg: '' };

  if (value.length < 12) {
    return {
      state: 'weak',
      msg: 'Password is too short (minimum 12 characters required).',
    };
  }

  if (!passwordRegex.test(value)) {
    return {
      state: 'invalid',
      msg: 'Password must have uppercase, lowercase, a digit, and a special character.',
    };
  }

  return { state: 'valid', msg: '' };
};
