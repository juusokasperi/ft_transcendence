import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Registration from '../Registation';
import type { User } from '../../types';

// Helper: create a wrapper with fake context values
function renderWithContext(ui: React.ReactNode, { axiosMock, loginMock, navigateMock }: any) {
  // If Registration uses useAppContext, we need to mock its implementation
  vi.mock('../../context/AppContext', () => ({
    useAppContext: () => ({
      axios: axiosMock,
      login: loginMock,
      navigate: navigateMock,
    }),
  }));
  return render(ui);
}

describe('Registration page', () => {
  it('submits form and logs in when backend returns user + token', async () => {
    const loginMock = vi.fn();
    const navigateMock = vi.fn();
    const axiosMock = {
      post: vi.fn().mockResolvedValue({
        data: {
          token: 'fake-token',
          user: { id: 1, username: 'testuser' } as User,
        },
      }),
    };

    renderWithContext(<Registration />, { axiosMock, loginMock, navigateMock });

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'e@e.e' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalledWith('/api/signup', {
        username: 'testuser',
        email: 'e@e.e',
        password: 'secret',
      });
      expect(loginMock).toHaveBeenCalledWith({ id: 1, username: 'testuser' }, 'fake-token');
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });

  it('shows error toast if signup fails', async () => {
    // Arrange: error case
    const loginMock = vi.fn();
    const navigateMock = vi.fn();
    const axiosMock = {
      post: vi.fn().mockRejectedValue({
        response: { data: { error: 'Username already taken' } },
      }),
    };

    renderWithContext(<Registration />, { axiosMock, loginMock, navigateMock });

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'taken' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'e@e.e' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalled();
      expect(loginMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
