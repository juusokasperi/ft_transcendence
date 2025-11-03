import React, { useState } from 'react';
import {
  validateEmail,
  validatePassword,
  validateUsername,
  emailInputAllowedRegex,
  usernameInputAllowedRegex,
  PASSWORD_MAX_LENGTH,
} from '../utils/validation';
import Button from './Button';
import GoogleIcon from './icons/GoogleIcon';

interface AuthFormProps {
  type: 'login' | 'register';
  onSubmit: (data: {
    username?: string;
    password: string;
    email: string;
    confirmPassword?: string;
  }) => void;
}

const USERNAME_MAX_LENGTH = 16;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = PASSWORD_MAX_LENGTH;

const AuthForm: React.FC<AuthFormProps> = ({ type, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const clearError = () => {
    if (error) {
      setError(null);
    }
  };

  const trimmedEmail = email.trim();
  const emailValidationState = trimmedEmail
    ? validateEmail(trimmedEmail)
      ? 'valid'
      : 'invalid'
    : '';
  const confirmPasswordState =
    type === 'register' && confirmPassword
      ? password.startsWith(confirmPassword)
        ? confirmPassword === password
          ? 'valid'
          : 'weak'
        : 'invalid'
      : '';

  const applyUsernameInput = (raw: string) => {
    clearError();
    const sanitized = raw.replace(/[^a-zA-Z0-9-]/g, '').slice(0, USERNAME_MAX_LENGTH);
    setUsername(sanitized);
  };

  const handleUsernameBeforeInput = (event: React.FormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (
      nativeEvent.inputType === 'insertText' &&
      nativeEvent.data &&
      !usernameInputAllowedRegex.test(nativeEvent.data)
    ) {
      event.preventDefault();
    }
  };

  const handleUsernameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ' ') {
      event.preventDefault();
    }
  };

  const applyEmailInput = (raw: string) => {
    clearError();
    const normalized = raw
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9.@_%+-]/g, '')
      .slice(0, MAX_EMAIL_LENGTH);
    const cleaned = normalized.replace(/^\.+/, '');
    setEmail(cleaned);
  };

  const handleEmailBeforeInput = (event: React.FormEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent as InputEvent;
    if (
      nativeEvent.inputType === 'insertText' &&
      nativeEvent.data &&
      !emailInputAllowedRegex.test(nativeEvent.data)
    ) {
      event.preventDefault();
    }
  };

  const handleEmailKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === ' ') {
      event.preventDefault();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!trimmedEmail || !password || (type === 'register' && (!confirmPassword || !username))) {
      setError('All fields are required.');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    const passVal = validatePassword(password);
    if (passVal.state !== 'valid') {
      setError(passVal.msg);
      return;
    }

    if (type === 'register') {
      const userVal = validateUsername(username);
      if (userVal.state !== 'valid') {
        setError(userVal.msg);
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    onSubmit({
      username,
      password,
      email: trimmedEmail,
      confirmPassword: type === 'register' ? confirmPassword : undefined,
    });
  };

  // border colors
  const getBorderClass = (state: string) => {
    if (state === 'valid') return 'border-green-500';
    if (state === 'invalid') return 'border-red-500';
    if (state === 'weak') return 'border-yellow-500';
    return 'border-gray-300';
  };

  const usernameValidation = validateUsername(username);
  const passwordValidation = validatePassword(password);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-500">{error}</p>}
      {success && <p className="text-green-600">{success}</p>}

      {/* Email */}
      <div>
        <label htmlFor="email" className="mb-1 block font-medium">
          Email
        </label>
        <input
          id="email"
          type="text"
          placeholder="Email"
          value={email}
          onChange={(e) => applyEmailInput(e.target.value)}
          onBeforeInput={handleEmailBeforeInput}
          onKeyDown={handleEmailKeyDown}
          className={`w-full rounded border px-3 py-2 ${getBorderClass(emailValidationState)}`}
        />
        {trimmedEmail && emailValidationState === 'invalid' && (
          <p className="mt-1 text-sm text-red-500">Please enter a valid email address.</p>
        )}
      </div>

      {/* Username */}
      {type === 'register' && (
        <div>
          <label htmlFor="username" className="mb-1 block font-medium">
            Username
          </label>
          <input
            id="username"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => applyUsernameInput(e.target.value)}
            onBeforeInput={handleUsernameBeforeInput}
            onKeyDown={handleUsernameKeyDown}
            className={`w-full rounded border px-3 py-2 ${getBorderClass(
              usernameValidation.state,
            )}`}
          />
          {usernameValidation.msg && (
            <p className="mt-1 text-sm text-red-500">{usernameValidation.msg}</p>
          )}
        </div>
      )}

      {/* Password */}
      <div>
        <label htmlFor="password" className="mb-1 block font-medium">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => {
              clearError();
              setPassword(e.target.value.slice(0, MAX_PASSWORD_LENGTH));
            }}
            maxLength={MAX_PASSWORD_LENGTH}
            className={`w-full rounded border px-3 py-2 ${
              password ? getBorderClass(passwordValidation.state) : 'border-gray-300'
            }`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-2 text-sm text-blue-600"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {password && passwordValidation.msg && (
          <p className="mt-1 text-sm text-red-500">{passwordValidation.msg}</p>
        )}
      </div>

      {/* Confirm Password */}
      {type === 'register' && (
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block font-medium">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => {
                clearError();
                setConfirmPassword(e.target.value.slice(0, MAX_PASSWORD_LENGTH));
              }}
              maxLength={MAX_PASSWORD_LENGTH}
              className={`w-full rounded border px-3 py-2 ${getBorderClass(confirmPasswordState)}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-2 text-sm text-blue-600"
            >
              {showConfirmPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {confirmPasswordState === 'invalid' && (
            <p className="mt-1 text-sm text-red-500">Passwords do not match.</p>
          )}
          {confirmPasswordState === 'valid' && (
            <p className="mt-1 text-sm text-emerald-500">Passwords match.</p>
          )}
        </div>
      )}

      <Button
        type="submit"
        fullWidth
        className="mb-3"
        variant={type === 'login' ? 'success' : 'primary'}
      >
        {type === 'login' ? 'Login' : 'Register'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        fullWidth
        onClick={() => (window.location.href = '/api/auth/google')}
        className="gap-3"
      >
        <GoogleIcon className="h-5 w-5" />
        Continue with Google
      </Button>
    </form>
  );
};

export default AuthForm;
