export const PaddleColorSchema = {
  type: 'string',
  pattern: '^#[0-9A-Fa-f]{6}$',
  description: 'Paddle color in hex format (e.g., #FFFFFF)',
  minLength: 7,
  maxLength: 7,
};

export const ColorBlindSchema = {
  type: 'integer',
  minimum: 0,
  maximum: 4,
};

export const PhotoSensitiveSchema = {
  type: 'integer',
  minimum: 0,
  maximum: 2,
};

export const PassSchema = {
  type: 'string',
  minLength: 12,
  maxLength: 42,
  allOf: [
    { pattern: '^[a-zA-Z0-9!@#$%^&*()\-_=+[\\]{};:|,<.>/?]+$' },
    { pattern: '[a-z]' },
    { pattern: '[A-Z]' },
    { pattern: '[0-9]' },
    { pattern: '[!@#$%^&*()\-_=+[\\]{};:|,<.>/?]+$' },
  ],
  description:
    'Password: Must contain uppercase, lowercase, digit and special character (!@#$%^&()-_=+[]{};:|,<.>/?',
};

export const UsernameSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 16,
  pattern: '^(?!-)(?!.*--)[a-zA-Z0-9-]+$',
  description:
    'Username: letters, numbers, dashes allowed. Cannot start with a dash or have consecutive dashes.',
};

export const EmailSchema = {
  type: 'string',
  format: 'email',
  description: 'User email address',
};

export const UuidSchema = {
  type: 'string',
  format: 'uuid',
  description: 'User unique id',
};

export const AvatarSchema = {
  anyOf: [
    { type: 'string' },
    { type: 'null' },
  ],
  description: 'User avatar filename',
};
