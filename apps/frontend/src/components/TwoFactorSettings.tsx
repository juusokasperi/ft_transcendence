import React, { useState } from 'react';
import QRCode from 'qrcode';
import type { AxiosError, AxiosInstance } from 'axios';
import type { User } from '../types';
import Button from './Button';
import { useSnackbar } from '../context/SnackbarContext';
import ConfirmDialog from './ConfirmDialog';
import { Spinner } from '@ft/spinner';

interface TwoFactorSettingsProps {
  axios: AxiosInstance;
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
}

const TwoFactorSettings: React.FC<TwoFactorSettingsProps> = ({ axios, user, setUser }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const debugLog = (...args: unknown[]) => {
    if (import.meta.env?.DEV) {
      console.debug('[OnlineGame]', ...args);
    }
  };

  const enabled = Boolean(user?.tfaEnabled);

  const generateQr = async (otpauthUrl: string) => {
    try {
      const url = await QRCode.toDataURL(otpauthUrl);
      setQrDataUrl(url);
    } catch (error) {
      debugLog('Failed to generate QR code', error);
      setQrDataUrl(null);
    }
  };

  const startSetup = async () => {
    setIsLoading(true);
    setVerificationCode('');
    try {
      const { data } = await axios.post('/api/users/me/tfa/setup');
      const nextSetup: SetupResponse = {
        secret: String(data.secret ?? ''),
        otpauthUrl: String(data.otpauthUrl ?? ''),
      };
      if (!nextSetup.secret || !nextSetup.otpauthUrl) {
        throw new Error('Invalid setup data received from server');
      }
      setSetupData(nextSetup);
      await generateQr(nextSetup.otpauthUrl);
      enqueueSnackbar({
        message: '2FA setup started. Scan the QR code.',
        variant: 'info',
      });
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(
          axiosErr?.response?.data?.message ?? err?.message ?? 'Failed to start setup',
        ),
        variant: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmSetup = async () => {
    const code = verificationCode.trim();
    if (code.length !== 6) {
      enqueueSnackbar({
        message: 'Please enter the code from your authenticator app.',
        variant: 'error',
      });
      return;
    }
    setIsConfirming(true);
    try {
      await axios.post('/api/users/me/tfa/confirm', {
        code: verificationCode,
      });
      setUser((prev) => (prev ? { ...prev, tfaEnabled: true } : prev));
      enqueueSnackbar({
        message: 'Two-factor authentication enabled',
        variant: 'success',
      });
      setSetupData(null);
      setQrDataUrl(null);
      setVerificationCode('');
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(
          axiosErr?.response?.data?.message ?? err?.message ?? 'Failed to confirm code',
        ),
        variant: 'error',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const disableTwoFactor = async () => {
    setIsLoading(true);
    try {
      await axios.delete('/api/users/me/tfa');
      setUser((prev) => (prev ? { ...prev, tfaEnabled: false } : prev));
      setSetupData(null);
      setQrDataUrl(null);
      setVerificationCode('');
      enqueueSnackbar({
        message: 'Two-factor authentication disabled',
        variant: 'success',
      });
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      enqueueSnackbar({
        message: String(
          axiosErr?.response?.data?.message ?? err?.message ?? 'Failed to disable 2FA',
        ),
        variant: 'error',
      });
    } finally {
      setIsLoading(false);
      setConfirmDisableOpen(false);
    }
  };

  const cancelSetup = async () => {
    setSetupData(null);
    setQrDataUrl(null);
    setVerificationCode('');
    try {
      await axios.delete('/api/users/me/tfa');
    } catch {
      /* ignore cleanup errors */
    }
  };

  const renderButtonSpinner = (label: string) => (
    <span className="inline-flex items-center gap-2">
      <Spinner size={18} color="#FFFFFF" aria-label={label} />
      <span>{label}</span>
    </span>
  );

  return (
    <div className="rounded border border-gray-200 p-6 shadow-sm">
      <div className="grid grid-cols-[1fr_auto] items-start gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Two-Factor Authentication</h2>
          <p className="text-sm text-gray-600">
            Protect your account with an additional verification step using an authenticator app.
          </p>
        </div>
        {enabled ? (
          <span className="justify-self-end rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            2fa enabled
          </span>
        ) : (
          <span className="justify-self-end rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
            Disabled
          </span>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {!enabled && !setupData && (
          <Button type="button" onClick={startSetup} disabled={isLoading}>
            {isLoading ? renderButtonSpinner('Preparing setup') : 'Enable 2FA'}
          </Button>
        )}

        {enabled && (
          <button
            type="button"
            className="rounded border border-red-500 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            onClick={() => setConfirmDisableOpen(true)}
            disabled={isLoading}
          >
            Disable 2FA
          </button>
        )}

        {setupData && (
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm text-gray-700">
                1. Scan this QR-code with Google Authenticator, 1Password, Authy or another
                authenticator app.
              </p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="2FA QR code" className="mt-3 h-40 w-40" />
              ) : (
                <div className="mt-3 h-40 w-40 animate-pulse rounded bg-gray-100" />
              )}
            </div>
            <div className="rounded bg-gray-50 p-3 text-sm">
              <p className="font-medium text-gray-700">Secret key</p>
              <p className="break-all font-mono text-gray-900">{setupData.secret}</p>
              <p className="text-xs text-gray-500">Use this key if you cannot scan the QR code.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="setup-code">
                2. Enter the 6-digit code from your app
              </label>
              <input
                id="setup-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                className="w-full rounded border border-gray-300 px-3 py-2"
                value={verificationCode}
                onChange={(event) =>
                  setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
              />
              {verificationCode && verificationCode.length < 6 && (
                <p className="mt-2 text-sm text-rose-500">Enter the full 6-digit code.</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={confirmSetup}
                  disabled={isConfirming || verificationCode.length !== 6}
                  className="flex-1"
                >
                  {isConfirming ? renderButtonSpinner('Confirming code') : 'Confirm & enable'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  tone="subtle"
                  onClick={cancelSetup}
                  disabled={isConfirming}
                  className="flex-1"
                  withMinWidth={false}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDisableOpen}
        title="Disable two-factor authentication?"
        description="You will lose the extra security provided by verification codes."
        confirmLabel={isLoading ? renderButtonSpinner('Disabling 2FA') : 'Disable 2FA'}
        cancelLabel="Keep 2FA"
        confirmDisabled={isLoading}
        tone="danger"
        onCancel={() => {
          if (isLoading) return;
          setConfirmDisableOpen(false);
        }}
        onConfirm={disableTwoFactor}
      />
    </div>
  );
};

export default TwoFactorSettings;
