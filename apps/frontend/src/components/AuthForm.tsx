import React, { useState } from 'react';
import Button from './Button';

interface AuthFormProps {
  type: 'login' | 'register';
  onSubmit: (data: {
    username?: string;
    password: string;
    email: string;
    confirmPassword?: string;
  }) => void;
}

const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'h-5 w-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={true}
  >
    <path
      fill="#4285F4"
      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3 2.3c1.7-1.6 2.7-3.9 2.7-6.5z"
    />
    <path
      fill="#34A853"
      d="M12 24c2.4 0 4.4-.8 5.9-2.2l-3-2.3c-.8.5-1.8.8-2.9.8-2.2 0-4.1-1.5-4.8-3.5l-3 .2C5.7 21.8 8.7 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M7.2 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8l-3-.2C3.4 11 3 11.9 3 13c0 1.1.4 2 1.2 3z"
    />
    <path
      fill="#EA4335"
      d="M12 7.5c1.3 0 2.5.4 3.4 1.3l2.6-2.6C16.4 4.7 14.4 4 12 4 8.7 4 5.7 6.1 4.3 9l3 2.2c.7-2 2.6-3.5 4.8-3.5z"
    />
  </svg>
);

const AuthForm: React.FC<AuthFormProps> = ({ type, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const usernameRegex = /^(?!-)([a-zA-Z0-9-]+)(?<!-)$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-=+[\]{};:|,<.>/?`]).{12,}$/;

  // Validation helpers
  const getUsernameValidation = () => {
    if (!username) return { state: '', msg: '' };
    if (usernameRegex.test(username)) return { state: 'valid', msg: '' };
    return {
      state: 'invalid',
      msg: 'Username may only contain letters, numbers, and dashes, and cannot start or end with a dash.',
    };
  };

  const getPasswordValidation = () => {
    if (!password) return { state: '', msg: '' };

    if (password.length < 12) {
      return {
        state: 'weak',
        msg: 'Password is too short (minimum 12 characters required).',
      };
    }

    if (!passwordRegex.test(password)) {
      return {
        state: 'invalid',
        msg: 'Password must have uppercase, lowercase, a digit, and a special character.',
      };
    }

    return { state: 'valid', msg: '' };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password || (type === 'register' && (!confirmPassword || !username))) {
      setError('All fields are required.');
      return;
    }

    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (type === 'register') {
      const userVal = getUsernameValidation();
      if (userVal.state !== 'valid') {
        setError(userVal.msg);
        return;
      }

      const passVal = getPasswordValidation();
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

  const usernameValidation = getUsernameValidation();
  const passwordValidation = getPasswordValidation();

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

      <Button type="submit" fullWidth className="mb-3">
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
