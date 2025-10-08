// Mock axios for refresh
const mockAxios = { post: vi.fn() };

// Mock navigate
let navigateMock = vi.fn();

import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import OnlineGame from '../../src/pages/pong/online-game';
import { AppProvider } from '../../src/context/AppContext';
import { SnackbarProvider } from '../../src/context/SnackbarContext';
import { SidebarProvider } from '../../src/context/SidebarContext';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock useAppContext to inject mockAxios and navigate
vi.mock('../../src/context/AppContext', () => {
  return {
    useAppContext: () => ({
      user: { username: 'test' },
      navigate: navigateMock,
      axios: mockAxios,
      login: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
      userReady: true,
    }),
    AppProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Mock createMatchmakingClient to simulate MM server responses
let mmClientInstance: any = null;
vi.mock('../../src/services/matchmaking', () => ({
  createMatchmakingClient: (cb: any) => {
    mmClientInstance = {
      socket: { close: vi.fn() },
      simulateError: (msg: string) => cb({ type: 'ERROR', code: 'AUTH', message: msg }),
    };
    return mmClientInstance;
  },
}));

function renderWithProviders() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <SidebarProvider>
          <SnackbarProvider>
            <OnlineGame />
          </SnackbarProvider>
        </SidebarProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe('OnlineGame auth error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes token and reconnects on "Token expired"', async () => {
    mockAxios.post.mockResolvedValueOnce({ status: 200 });
    renderWithProviders();
    act(() => {
      mmClientInstance.simulateError('Token expired');
    });
    await waitFor(() => {
      expect(mockAxios.post).toHaveBeenCalledWith('/api/auth/refresh');
    });
  });

  it('shows error and navigates to login if refresh fails', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('fail'));
    renderWithProviders();
    act(() => {
      mmClientInstance.simulateError('Token expired');
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login');
    });
  });

  it('navigates to login immediately on "Invalid token"', async () => {
    renderWithProviders();
    act(() => {
      mmClientInstance.simulateError('Invalid token');
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/login');
    });
  });
});
