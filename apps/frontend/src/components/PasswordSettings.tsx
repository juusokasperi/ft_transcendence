import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';

interface PasswordSettingsProps {
  axios: typeof import('axios');
  active: boolean;
}

const primaryButtonClass =
  'inline-flex min-w-[150px] items-center justify-center rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-=+[\]{};:|,<.>/?`]).{12,}$/;

const PasswordSettings: React.FC<PasswordSettingsProps> = ({ axios, active }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [initialising, setInitialising] = useState<boolean>(true);
  const [hasPassword, setHasPassword] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrent, setShowCurrent] = useState<boolean>(false);
  const [showNew, setShowNew] = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  useEffect(() => {
    if (!active) {
      setInitialising(true);
      setHasPassword(false);
      resetForm();
      return;
    }

    axios
      .get('/api/users/me?pass=yes')
      .then(({ data }) => {
        setHasPassword(Boolean(data?.hasPass));
      })
      .catch(() => {
        toast.error('Failed to determine password status');
      })
      .finally(() => setInitialising(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, axios]);

  const resetForm = () => {
    setError(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const beginEdit = () => {
    resetForm();
    setIsEditing(true);
  };

  const cancelEdit = () => {
    resetForm();
    setIsEditing(false);
  };

  const validate = () => {
    if (!newPassword) {
      setError('Please enter a new password.');
      return false;
    }

    if (newPassword.length < 12) {
      setError('Password is too short (minimum 12 characters).');
      return false;
    }

    if (!passwordRegex.test(newPassword)) {
      setError('Use upper, lower, number, and special characters.');
      return false;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return false;
    }

    if (hasPassword && !currentPassword) {
      setError('Enter your current password to continue.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      await axios.patch('/api/users/me/password', {
        newPassword,
        ...(hasPassword ? { currentPassword } : {}),
      });
      toast.success('Password updated');
      setHasPassword(true);
      setIsEditing(false);
      resetForm();
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ message?: string; error?: string }>;
      const message = axiosErr?.response?.data?.message ?? axiosErr?.response?.data?.error;
      setError(message ?? 'Update failed');
      toast.error(message ?? 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const InputWrapper: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
    <label className="block">
      <span className="mb-2 block font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );

  const ToggleButton = ({
    onClick,
    active,
  }: {
    onClick: () => void;
    active: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold uppercase tracking-wide text-indigo-500 hover:text-indigo-400"
    >
      {active ? 'Hide' : 'Show'}
    </button>
  );

  if (!active) return null;

  return (
    <div className="rounded border border-gray-200 p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Password</h2>
          <p className="text-sm text-gray-500">
            {initialising
              ? 'Checking password status...'
              : hasPassword
              ? 'Update your password regularly to keep your account secure.'
              : 'Set a password so you can sign in without Google next time.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!initialising && (
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                hasPassword ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {hasPassword ? 'Password enabled' : 'No password yet'}
            </span>
          )}
        </div>
      </div>

      {isEditing ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          {hasPassword && (
            <InputWrapper label="Current password">
            <div className="flex items-center rounded border border-gray-300 p-2">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="flex-1 border-none bg-transparent text-sm outline-none"
                />
                <ToggleButton onClick={() => setShowCurrent((prev) => !prev)} active={showCurrent} />
              </div>
            </InputWrapper>
          )}

          <InputWrapper label="New password">
            <div className="flex items-center rounded border border-gray-300 p-2">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 border-none bg-transparent text-sm outline-none"
              />
              <ToggleButton onClick={() => setShowNew((prev) => !prev)} active={showNew} />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Minimum 12 characters. Include upper, lower, number, and special character.
            </p>
          </InputWrapper>

          <InputWrapper label="Confirm new password">
            <div className="flex items-center rounded border border-gray-300 p-2">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="flex-1 border-none bg-transparent text-sm outline-none"
              />
              <ToggleButton onClick={() => setShowConfirm((prev) => !prev)} active={showConfirm} />
            </div>
          </InputWrapper>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={primaryButtonClass}
            >
              {loading ? 'Saving...' : hasPassword ? 'Update Password' : 'Set Password'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            {initialising
              ? 'Loading...'
              : hasPassword
              ? 'Password authentication is enabled for this account.'
              : 'You currently sign in via Google. Add a password for backup access.'}
          </div>
          <button
            type="button"
            onClick={beginEdit}
            disabled={initialising}
            className={primaryButtonClass}
          >
            {hasPassword ? 'Change Password' : 'Set Password'}
          </button>
        </div>
      )}
    </div>
  );
};

export default PasswordSettings;
