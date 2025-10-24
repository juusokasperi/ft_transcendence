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
export const emailRegex = /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

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
export const passwordAllowedCharsRegex = /^[a-zA-Z0-9!@#$%^&*()\-_=+\[\]{};:|,<.>/?]+$/;

export const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};:|,<.>/?])[a-zA-Z0-9!@#$%^&*()\-_=+\[\]{};:|,<.>/?]{12,42}$/;

export const validateEmail = (value: string): boolean => emailRegex.test(value);

// Allowed character set for email input fields (before validation).
export const emailInputAllowedRegex = /^[a-zA-Z0-9@._%+-]+$/;

// Allowed character set for username input fields.
export const usernameInputAllowedRegex = /^[a-zA-Z0-9-]+$/;

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 16;

export const validateUsername = (value: string): ValidationResult => {
  if (!value) return { state: '', msg: '' };

  if (value.length < USERNAME_MIN_LENGTH) {
    return {
      state: 'invalid',
      msg: `Username must be at least ${USERNAME_MIN_LENGTH} characters long.`,
    };
  }

  if (value.length > USERNAME_MAX_LENGTH) {
    return {
      state: 'invalid',
      msg: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`,
    };
  }

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

  if (value.length > 42) {
    return {
      state: 'invalid',
      msg: 'Password must be 42 characters or fewer.',
    };
  }

  if (!passwordAllowedCharsRegex.test(value)) {
    return {
      state: 'invalid',
      msg: 'Password has invalid characters.',
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
