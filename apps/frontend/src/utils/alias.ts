export const ALIAS_MAX_LENGTH = 16;

const ALIAS_FORBIDDEN_CHARS_REGEX = /[^a-zA-Z0-9_-]/g;

export const aliasInputAllowedRegex = /^[a-zA-Z0-9_-]+$/;

export const clampAliasLength = (value: string): string => value.slice(0, ALIAS_MAX_LENGTH);

export const sanitizeAliasInput = (value: string): string => {
  const cleaned = value.replace(ALIAS_FORBIDDEN_CHARS_REGEX, '');
  return clampAliasLength(cleaned);
};
