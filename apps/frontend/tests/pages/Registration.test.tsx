import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { SidebarProvider } from '../../src/context/SidebarContext';

const enqueueMock = vi.fn();

vi.mock('../../src/context/SnackbarContext', () => ({
  useSnackbar: () => ({
    enqueueSnackbar: enqueueMock,
    dismissSnackbar: vi.fn(),
  }),
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
    enqueueMock.mockReset();
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
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalledWith('/api/signup', {
        username: 'testuser',
        email: 'user@example.com',
        password: 'StrongPass123!',
      });
      // no auto-login in email confirmation flow
      expect(loginMock).not.toHaveBeenCalled();
      expect(enqueueMock).toHaveBeenCalledWith({
        message: 'Confirmation link sent to email.',
        variant: 'success',
      });
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
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'StrongPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalled();
      expect(enqueueMock).toHaveBeenCalledWith({
        message: 'Username already taken',
        variant: 'error',
      });
      expect(loginMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
