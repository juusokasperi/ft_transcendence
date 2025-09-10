import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { User } from '../../src/types';
import { vi } from 'vitest';

const axiosMock = { post: vi.fn() };
const loginMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({
    axios: axiosMock,
    login: loginMock,
    navigate: navigateMock,
    user: null,
  }),
}));

import Registration from '../../src/pages/Registation';

describe('Registration page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits form and logs in when backend returns token and user', async () => {
    axiosMock.post.mockResolvedValue({
      data: { token: 'fake-token', user: { id: 1, username: 'testuser' } as User },
    });

    render(<Registration />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'e@e.e' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalledWith('/api/signup', {
        username: 'testuser',
        email: 'e@e.e',
        password: 'StrongPass123!',
      });
      expect(loginMock).toHaveBeenCalledWith('fake-token');
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });

  it('does not navigate when signup fails', async () => {
    axiosMock.post.mockRejectedValue({
      response: { data: { message: 'Username already taken' } },
    });

    render(<Registration />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'taken' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'e@e.e' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalled();
      expect(loginMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
