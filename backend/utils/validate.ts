import FastestValidator from 'fastest-validator';
// @ts-ignore
const v = new FastestValidator();

const passwordValidator = (value: string) => {
	const validationErrors: any = [];
	const allowedChars = /^[a-zA-Z0-9!@#$%^&*()\-_=+[\]{};:|,<.>/?]+$/;
	if (!allowedChars.test(value))
		validationErrors.push({ type: "invalidCharacters" });
	const hasLower = /[a-z]/.test(value);
	const hasUpper = /[A-Z]/.test(value);
	const hasDigit = /[0-9]/.test(value);
	const hasSpecial = /[!@#$%^&*()\-_=+[\]{};:|,<.>/?]/.test(value);

	if (!hasLower || !hasUpper || !hasDigit || !hasSpecial)
		validationErrors.push({ type: "missingCharacterType" });
	return validationErrors.length > 0 ? validationErrors : true;
};

export const schemas = {
	signup: {
		username: { type: "string", min: 1, max: 20 },
		email: { type: "email" },
		password: {
			type: "string",
			optional: true,
			min: 12,
			custom: passwordValidator
		},
		googleAuth: { type: "string", optional: true }
	},

	login: {
		username: { type: "string", min: 1, max: 20 },
		password: { type: "string", min: 12 },
	},

	changePassword: {
		currentPassword: { type: "string", min: 12 },
		newPassword: {
			type: "string",
			min: 12,
			custom: passwordValidator
		}
	}
};

export const validator = v;
export const validateSignup = v.compile(schemas.signup);
export const validateLogin = v.compile(schemas.login);
export const validateChangePassword = v.compile(schemas.changePassword);
