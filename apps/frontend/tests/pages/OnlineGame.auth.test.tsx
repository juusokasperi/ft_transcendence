// Mock axios for refresh
const mockAxios = { post: vi.fn() };

// Mock navigate
let navigateMock = vi.fn();
let setUserMock = vi.fn();

import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import OnlineGame from '../../src/pages/pong/online/OnlineGame';
import { AppProvider } from '../../src/context/AppContext';
import { SnackbarProvider } from '../../src/context/SnackbarContext';
import { SidebarProvider } from '../../src/context/SidebarContext';
import { MatchActivityProvider } from '../../src/context/MatchActivityContext';
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
      setUser: setUserMock,
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
            <MatchActivityProvider>
              <OnlineGame />
            </MatchActivityProvider>
          </SnackbarProvider>
        </SidebarProvider>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe('OnlineGame auth error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUserMock = vi.fn();
  });

  it('refreshes token and reconnects on "Token expired"', async () => {
    mockAxios.post.mockResolvedValueOnce({ status: 200 });
    renderWithProviders();
    act(() => {
      mmClientInstance.simulateError('Token expired');
    });
    await waitFor(() => {
      expect(mockAxios.post).toHaveBeenCalledWith('/api/auth/refresh');
      expect(setUserMock).not.toHaveBeenCalled();
    });
  });

  it('shows error, calls setUser if refresh fails', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('fail'));
    renderWithProviders();
    act(() => {
      mmClientInstance.simulateError('Token expired');
    });
    await waitFor(() => {
      expect(mockAxios.post).toHaveBeenCalledWith('/api/auth/refresh');
      expect(setUserMock).toHaveBeenCalledWith(null);
    });
  });

  it('calls setUser if "Invalid token"', async () => {
    renderWithProviders();
    act(() => {
      mmClientInstance.simulateError('Invalid token');
    });
    await waitFor(() => {
      expect(setUserMock).toHaveBeenCalledWith(null);
    });
  });
});
