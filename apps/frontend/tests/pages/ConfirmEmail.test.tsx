import { render, screen, waitFor } from '@testing-library/react';
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
const setUserMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('../../src/context/AppContext', () => ({
  useAppContext: () => ({
    axios: axiosMock,
    setUser: setUserMock,
    navigate: navigateMock,
    user: null,
  }),
}));

// Mock useParams
const mockUseParams = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
  };
});

import ConfirmEmail from '../../src/pages/ConfirmEmail';

describe('ConfirmEmail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueMock.mockReset();
  });

  it('shows validating state initially', () => {
    mockUseParams.mockReturnValue({ token: 'validtoken123' });

    render(
      <SidebarProvider>
        <MemoryRouter>
          <ConfirmEmail />
        </MemoryRouter>
      </SidebarProvider>,
    );

    expect(screen.getByText('Confirming your new email...')).toBeInTheDocument();
  });

  it('shows success message and navigates on successful confirmation', async () => {
    mockUseParams.mockReturnValue({ token: 'validtoken123' });
    axiosMock.post.mockResolvedValue({});

    render(
      <SidebarProvider>
        <MemoryRouter>
          <ConfirmEmail />
        </MemoryRouter>
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Email updated successfully! Redirecting...')).toBeInTheDocument();
    });

    expect(enqueueMock).toHaveBeenCalledWith({
      message: 'Email successfully updated!',
      variant: 'success',
    });

    await waitFor(
      () => {
        expect(navigateMock).toHaveBeenCalledWith('/profile');
      },
      { timeout: 2000 },
    );
  });

  it('shows error message on failed confirmation', async () => {
    mockUseParams.mockReturnValue({ token: 'invalidtoken' });
    const errorMessage = 'Invalid or expired token';
    axiosMock.post.mockRejectedValue({
      response: {
        data: { message: errorMessage },
      },
    });

    render(
      <SidebarProvider>
        <MemoryRouter>
          <ConfirmEmail />
        </MemoryRouter>
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired confirmation link.')).toBeInTheDocument();
    });

    expect(enqueueMock).toHaveBeenCalledWith({
      message: errorMessage,
      variant: 'error',
    });
  });

  it('shows generic error message when no specific error message', async () => {
    mockUseParams.mockReturnValue({ token: 'some-token' });
    axiosMock.post.mockRejectedValue(new Error('Network error'));

    render(
      <SidebarProvider>
        <MemoryRouter>
          <ConfirmEmail />
        </MemoryRouter>
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Invalid or expired confirmation link.')).toBeInTheDocument();
    });

    expect(enqueueMock).toHaveBeenCalledWith({
      message: 'Email confirmation failed',
      variant: 'error',
    });
  });

  it('makes API call with correct token', async () => {
    const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    mockUseParams.mockReturnValue({ token });
    axiosMock.post.mockResolvedValue({});

    render(
      <SidebarProvider>
        <MemoryRouter>
          <ConfirmEmail />
        </MemoryRouter>
      </SidebarProvider>,
    );

    await waitFor(() => {
      expect(axiosMock.post).toHaveBeenCalledWith(`/api/users/confirm-email/${token}`);
    });
  });

  it('does not make API call when no token', () => {
    mockUseParams.mockReturnValue({});

    render(
      <SidebarProvider>
        <MemoryRouter>
          <ConfirmEmail />
        </MemoryRouter>
      </SidebarProvider>,
    );

    expect(axiosMock.post).not.toHaveBeenCalled();
    expect(screen.getByText('Confirming your new email...')).toBeInTheDocument();
  });
});
