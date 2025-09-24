import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { SidebarProvider } from '../../src/context/SidebarContext';

// Mock toast so it doesn't actually render toasts
const successMock = vi.fn();
const errorMock = vi.fn();
vi.mock('react-hot-toast', () => ({
  toast: {
    success: (...args: any[]) => successMock(...args),
    error: (...args: any[]) => errorMock(...args),
  },
}));

// Context mocks
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

import Registration from '../../src/pages/Registration';

describe('Registration page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows success and navigates to /login when signup succeeds (email confirmation flow)', async () => {
    axiosMock.post.mockResolvedValue({
      data: { success: 'Confirmation link sent to email.' },
    });

    render(
      <SidebarProvider>
        <MemoryRouter>
          <Registration />
        </MemoryRouter>
      </SidebarProvider>,
    );

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'e@e.e' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123!' } });
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
      // no auto-login in email confirmation flow
      expect(loginMock).not.toHaveBeenCalled();
      expect(successMock).toHaveBeenCalledWith('Confirmation link sent to email.');
      expect(navigateMock).toHaveBeenCalledWith('/login');
    });
  });

  it('shows error and does not navigate when signup fails', async () => {
    axiosMock.post.mockRejectedValue({
      response: { data: { message: 'Username already taken' } },
    });

    render(
      <SidebarProvider>
        <MemoryRouter>
          <Registration />
        </MemoryRouter>
      </SidebarProvider>,
    );

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'taken' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'e@e.e' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalled();
      expect(errorMock).toHaveBeenCalledWith('Username already taken');
      expect(loginMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
