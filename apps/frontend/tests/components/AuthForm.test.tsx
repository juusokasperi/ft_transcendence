import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthForm from '../../src/components/AuthForm';
import { vi } from 'vitest';

describe('AuthForm', () => {
  it('submits login data', () => {
    const handleSubmit = vi.fn();
    render(<AuthForm type="login" onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'StrongPass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      username: '',
      email: 'user@example.com',
      password: 'StrongPass123!',
      confirmPassword: undefined,
    });
  });

  it('shows error when passwords do not match on register', () => {
    const handleSubmit = vi.fn();
    render(<AuthForm type="register" onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'user-1' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'Mismatch123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });
});