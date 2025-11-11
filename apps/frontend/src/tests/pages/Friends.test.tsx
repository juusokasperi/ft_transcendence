import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock AppContext and Snackbar to provide minimal hooks used by Friends
vi.mock('../../context/AppContext', () => ({
  useAppContext: () => ({
    axios: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), defaults: { baseURL: '' } },
    navigate: vi.fn(),
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
    userReady: true,
  }),
}));
vi.mock('../../context/SnackbarContext', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}));

import Friends from '../../pages/Friends';

describe('Friends input sanitization', () => {
  it('sanitizes username input by removing invalid characters and spaces', () => {
    render(<Friends />);
    // open the "Add" tab which contains the input
    const addTab = screen.getByRole('button', { name: /Add/i });
    fireEvent.click(addTab);
    const input = screen.getByPlaceholderText('Enter username or email') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'user! name$' } });
    expect(input.value).toBe('username');

    // allow dashes
    fireEvent.change(input, { target: { value: 'john-doe' } });
    expect(input.value).toBe('john-doe');
  });

  it('sanitizes email input - removes spaces, lowercases and strips invalid chars', () => {
    render(<Friends />);
    const addTab = screen.getByRole('button', { name: /Add/i });
    fireEvent.click(addTab);
    const input = screen.getByPlaceholderText('Enter username or email') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Test@Exa mple.COM ' } });
    expect(input.value).toBe('test@example.com');

    // invalid characters removed
    fireEvent.change(input, { target: { value: 'bad@em!ail#.com' } });
    expect(input.value).toBe('bad@email.com');
  });
});
