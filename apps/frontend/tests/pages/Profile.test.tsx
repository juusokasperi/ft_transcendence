import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
const axiosMock = {
  patch: vi.fn(),
  defaults: { baseURL: 'http://localhost:3000' },
};
const setUserMock = vi.fn();

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({
    axios: axiosMock,
    setUser: setUserMock,
    user: {
      username: 'testuser',
      email: 'old@example.com',
      uuid: 'user-uuid',
      avatar: null,
      wins: 5,
      losses: 3,
      tfaEnabled: false,
    },
  }),
}));

// Mock validation
vi.mock('../../src/utils/validation', () => ({
  validateUsername: vi.fn(),
  validateEmail: vi.fn(() => true), // Default to valid
}));

// Mock components
vi.mock('../../src/components/TwoFactorSettings', () => ({
  default: () => <div>TwoFactorSettings</div>,
}));

vi.mock('../../src/components/PasswordSettings', () => ({
  default: () => <div>PasswordSettings</div>,
}));

vi.mock('../../src/components/Button', () => ({
  default: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('../../src/components/ConfirmDialog', () => ({
  default: () => <div>ConfirmDialog</div>,
}));

vi.mock('../../src/utils/avatarUrl', () => ({
  PLACEHOLDER: '/placeholder.png',
  resolveAvatarUrl: vi.fn(() => '/placeholder.png'),
}));

import Profile from '../../src/pages/Profile';
import { validateEmail } from '../../src/utils/validation';

describe('Profile page - handleEmailChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueMock.mockReset();
    axiosMock.patch.mockReset();
    setUserMock.mockReset();
  });

  it('does not make API call when email is not dirty', async () => {
    render(
      <SidebarProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </SidebarProvider>,
    );

    // Click edit button
    fireEvent.click(screen.getByText('Edit profile'));

    // Email should be pre-filled with current email
    const emailInput = screen.getByDisplayValue('old@example.com');
    expect(emailInput).toBeInTheDocument();

    // Click save without changing email
    fireEvent.click(screen.getByText('Save changes'));

    // Should not call email API since email wasn't changed
    await waitFor(() => {
      expect(axiosMock.patch).not.toHaveBeenCalledWith('/api/users/me/email', expect.anything());
    });
  });

  it('validates email format before making API call', async () => {
    const validateEmailMock = validateEmail as any;
    validateEmailMock.mockReturnValue(false); // Invalid email

    render(
      <SidebarProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </SidebarProvider>,
    );

    // Click edit button
    fireEvent.click(screen.getByText('Edit profile'));

    // Change email to invalid format
    const emailInput = screen.getByPlaceholderText('old@example.com');
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

    // Click save
    fireEvent.click(screen.getByText('Save changes'));

    // Should not call API
    expect(axiosMock.patch).not.toHaveBeenCalledWith('/api/users/me/email', expect.anything());
  });

  it('successfully changes email and shows success message', async () => {
    const validateEmailMock = validateEmail as any;
    validateEmailMock.mockReturnValue(true); // Valid email

    axiosMock.patch.mockResolvedValueOnce({});

    render(
      <SidebarProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </SidebarProvider>,
    );

    // Click edit button
    fireEvent.click(screen.getByText('Edit profile'));

    // Change email
    const emailInput = screen.getByPlaceholderText('old@example.com');
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });

    // Click save
    fireEvent.click(screen.getByText('Save changes'));

    // Should call email change API
    await waitFor(() => {
      expect(axiosMock.patch).toHaveBeenCalledWith('/api/users/me/email', {
        newEmail: 'new@example.com',
      });
    });

    // Should show success message
    expect(enqueueMock).toHaveBeenCalledWith({
      message: 'Confirmation email sent to new email address',
      variant: 'success',
    });
  });

  it('handles API error and shows error message', async () => {
    const validateEmailMock = validateEmail as any;
    validateEmailMock.mockReturnValue(true); // Valid email

    axiosMock.patch.mockRejectedValueOnce({
      response: {
        data: { message: 'Email already in use' },
      },
    });

    render(
      <SidebarProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </SidebarProvider>,
    );

    // Click edit button
    fireEvent.click(screen.getByText('Edit profile'));

    // Change email
    const emailInput = screen.getByPlaceholderText('old@example.com');
    fireEvent.change(emailInput, { target: { value: 'taken@example.com' } });

    // Click save
    fireEvent.click(screen.getByText('Save changes'));

    // Should call email change API
    await waitFor(() => {
      expect(axiosMock.patch).toHaveBeenCalledWith('/api/users/me/email', {
        newEmail: 'taken@example.com',
      });
    });

    // Should show error message
    expect(enqueueMock).toHaveBeenCalledWith({
      message: 'Email already in use',
      variant: 'error',
    });
  });

  it('handles generic API error when no specific message', async () => {
    const validateEmailMock = validateEmail as any;
    validateEmailMock.mockReturnValue(true); // Valid email

    axiosMock.patch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <SidebarProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </SidebarProvider>,
    );

    // Click edit button
    fireEvent.click(screen.getByText('Edit profile'));

    // Change email
    const emailInput = screen.getByPlaceholderText('old@example.com');
    fireEvent.change(emailInput, { target: { value: 'network@example.com' } });

    // Click save
    fireEvent.click(screen.getByText('Save changes'));

    // Should call email change API
    await waitFor(() => {
      expect(axiosMock.patch).toHaveBeenCalledWith('/api/users/me/email', {
        newEmail: 'network@example.com',
      });
    });

    // Should show generic error message
    expect(enqueueMock).toHaveBeenCalledWith({
      message: 'Unable to request email change',
      variant: 'error',
    });
  });

  it('shows email input field when in editing mode', () => {
    render(
      <SidebarProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </SidebarProvider>,
    );

    // Initially should show email as text
    expect(screen.getByText('old@example.com')).toBeInTheDocument();

    // Click edit button
    fireEvent.click(screen.getByText('Edit profile'));

    // Should show email input field
    const emailInput = screen.getByDisplayValue('old@example.com');
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');

    // Should show helper text
    expect(
      screen.getByText('A confirmation email will be sent to your new email address'),
    ).toBeInTheDocument();
  });
});
