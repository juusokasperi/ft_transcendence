import React, { useState } from 'react';

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

  const usernameRegex = /^(?!-)([a-zA-Z0-9-]+)(?<!-)$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-=+[\]{};:|,<.>/?`]).{12,}$/;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email || !password || (type === 'register' && !confirmPassword && !username)) {
      setError('All fields are required.');
      return;
    }

    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (type === 'register') {
      // username validation
      if (!usernameRegex.test(username)) {
        setError(
          'Username may only contain letters, numbers, and dashes, and cannot start or end with a dash.',
        );
        return;
      }

      // password match
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      // password validation
      if (!passwordRegex.test(password)) {
        setError(
          'Password must be at least 12 characters and include uppercase, lowercase, a digit, and a special character.',
        );
        return;
      }
    }

    // call container's onSubmit (container will call API / set context)
    onSubmit({
      username,
      password,
      email,
      confirmPassword: type === 'register' ? confirmPassword : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-500">{error}</p>}
      {success && <p className="text-green-600">{success}</p>}

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
          className="w-full rounded border px-3 py-2"
        />
      </div>

      {type === 'register' && (
        <div>
          <label htmlFor="username" className="mb-1 block font-medium">
            Username
          </label>
          <input
            id="username"
            type="username"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      <div>
        <label htmlFor="password" className="mb-1 block font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
        />
      </div>

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
            className="w-full rounded border px-3 py-2"
          />
        </div>
      )}

      <button
        type="submit"
        className="mb-3 w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700"
      >
        {type === 'login' ? 'Login' : 'Register'}
      </button>
    </form>
  );
};

export default AuthForm;
