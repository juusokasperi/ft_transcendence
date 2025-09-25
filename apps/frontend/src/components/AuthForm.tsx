import React, { useState } from 'react';
import { validateEmail, validatePassword, validateUsername } from '../utils/validation';
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

const AuthForm: React.FC<AuthFormProps> = ({ type, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password || (type === 'register' && (!confirmPassword || !username))) {
      setError('All fields are required.');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (type === 'register') {
      const userVal = validateUsername(username);
      if (userVal.state !== 'valid') {
        setError(userVal.msg);
        return;
      }

      const passVal = validatePassword(password);
      if (passVal.state !== 'valid') {
        setError(passVal.msg);
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
      email,
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
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
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
            onChange={(e) => setUsername(e.target.value)}
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
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full rounded border px-3 py-2 ${
              type === 'register' ? getBorderClass(passwordValidation.state) : 'border-gray-300'
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

        {/* show messages only on register */}
        {type === 'register' && passwordValidation.msg && (
          <p className="mt-1 text-sm text-red-500">{passwordValidation.msg}</p>
        )}
      </div>

      {/* Confirm Password */}
      {type === 'register' && (
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block font-medium">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`w-full rounded border px-3 py-2 ${
              confirmPassword && confirmPassword !== password ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {confirmPassword && confirmPassword !== password && (
            <p className="mt-1 text-sm text-red-500">Passwords do not match.</p>
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
