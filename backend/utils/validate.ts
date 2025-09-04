import FastestValidator from 'fastest-validator';
// @ts-ignore
const v = new FastestValidator();

// Allow only alphanumeric characters and special characters !@#$%^&*()\-_=+[\]{};:|,<.>/?
// Must have one lower, one upper, one digit, one special character
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

// Allow alphanumeric characters and a dash (-).
// No leading/trailing/consecutive dashes.
const usernameValidator = (value: string) => {
	const validationErrors: any = [];
	const allowedChars = /^(?!-)(?!.*--)[a-zA-Z0-9-]+$/;
	if (!allowedChars.test(value))
		validationErrors.push({ type: "invalidCharacters" });
	return validationErrors.length > 0 ? validationErrors : true;
};

const rgbValidator = (value: string) => {
	const validationErrors: any = [];
	const rgbFormat = /^#[0-9A-Fa-f]{6}$/;
	if (!rgbFormat.test(value))
		validationErrors.push( { type: "invalidCharacters" });
	return validationErrors.length > 0 ? validationErrors : true;
};

export const schemas = {
	signup: {
		username: {
			type: "string",
			min: 3,
			max: 16,
			custom: usernameValidator
		},
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
		email: { type: "email" },
		password: { type: "string", min: 12 },
	},

	changePassword: {
		currentPassword: { type: "string", min: 12 },
		newPassword: {
			type: "string",
			min: 12,
			custom: passwordValidator
		}
	},

	changeUsername: {
		newUsername: {
			type: "string",
			min: 3,
			max: 16,
			custom: usernameValidator
		}
	},

	respondToFriendRequest: {
		accept: {
			type: "boolean"
		}
	},

	addFriend: {
		username: {
			type: "string",
			min: 3,
			max: 16,
			custom: usernameValidator
		}
	},

	updateUserSettings: {
		paddleColor: {
			type: "string",
			length: 7,
			optional: true,
			custom: rgbValidator
		},
		colorBlindMode: {
			type: "number",
			min: 0,
			max: 4,
			optional: true
		},
		photoSensitiveMode: {
			type: "number",
			min: 0,
			max: 2,
			optional: true
		}
	}
};

export const validator = v;
export const validateSignup = v.compile(schemas.signup);
export const validateLogin = v.compile(schemas.login);
export const validateChangePassword = v.compile(schemas.changePassword);
export const validateChangeUsername = v.compile(schemas.changeUsername);
export const validateFriendResponse = v.compile(schemas.respondToFriendRequest);
export const validateFriendAdd = v.compile(schemas.addFriend);
export const validateUserSettings = v.compile(schemas.updateUserSettings);
