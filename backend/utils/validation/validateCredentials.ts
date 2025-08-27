function isRepetitive(password: string): Boolean {
	return /^([a-zA-Z0-9!@#$%^&*])\1+$/.test(password);
}

export function validatePassword(password: string): string | null {
	if (typeof(password) !== 'string' || password.length < 8 || password.length > 64)
		return 'Password must be between 8-64 characters long.';
	if (isRepetitive(password))
		return 'Invalid password (repetitive).'
	return null;
};
