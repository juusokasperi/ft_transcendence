import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthForm from '../../src/components/AuthForm';
import { vi } from 'vitest';

describe('AuthForm', () => {
  let handleSubmit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handleSubmit = vi.fn();
  });

  it('submits login data when valid', () => {
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

  it('shows error if fields are missing on register', () => {
    render(<AuthForm type="register" onSubmit={handleSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('All fields are required.')).toBeInTheDocument();
  });

  it('shows error for invalid email', () => {
    render(<AuthForm type="login" onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'invalid-email' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'StrongPass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
  });

  it('shows error when passwords do not match on register', () => {
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

    const confirmDiv = screen.getByPlaceholderText('Confirm Password').closest('div')!;
    expect(within(confirmDiv).getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('submits register data when valid', () => {
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
      target: { value: 'StrongPass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      username: 'user-1',
      email: 'user@example.com',
      password: 'StrongPass123!',
      confirmPassword: 'StrongPass123!',
    });
  });

  it('shows error when username is invalid', () => {
    render(<AuthForm type="register" onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'invalid_user!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'StrongPass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(handleSubmit).not.toHaveBeenCalled();

    const usernameDiv = screen.getByPlaceholderText('Username').closest('div')!;
    expect(
      within(usernameDiv).getByText(
        'Username may only contain letters, numbers, and dashes, and cannot start or end with a dash.',
      ),
    ).toBeInTheDocument();
  });

  it('shows error when password is invalid', () => {
    render(<AuthForm type="register" onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'validuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'weakpass123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'weakpass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(handleSubmit).not.toHaveBeenCalled();

    // Use getAllByText and check at least one match
    const errors = screen.getAllByText(
      /Password is too short \(minimum 12 characters required\)\./,
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('shows error when password is invalid', () => {
    render(<AuthForm type="register" onSubmit={handleSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'validuser' },
    });
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'weakpass12345!' }, // no uppercase letter
    });
    fireEvent.change(screen.getByPlaceholderText('Confirm Password'), {
      target: { value: 'weakpass12345!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(handleSubmit).not.toHaveBeenCalled();

    // Check error globally
    const errors = screen.getAllByText(
      'Password must have uppercase, lowercase, a digit, and a special character.',
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
