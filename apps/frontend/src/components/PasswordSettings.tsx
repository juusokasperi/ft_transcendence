import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import Button from './Button';

interface PasswordSettingsProps {
  axios: typeof import('axios');
  active: boolean;
}

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
  const [focusedField, setFocusedField] = useState<'current' | 'new' | 'confirm' | null>(null);

  const currentInputRef = useRef<HTMLInputElement | null>(null);
  const newInputRef = useRef<HTMLInputElement | null>(null);
  const confirmInputRef = useRef<HTMLInputElement | null>(null);

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
    setFocusedField(null);
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

  const InputWrapper: React.FC<
    React.PropsWithChildren<{ label: string; htmlFor: string }>
  > = ({ label, htmlFor, children }) => (
    <div className="flex flex-col">
      <label className="mb-2 text-sm font-medium text-gray-700" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
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
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="text-xs font-semibold uppercase tracking-wide text-indigo-500 hover:text-indigo-400"
    >
      {active ? 'Hide' : 'Show'}
    </button>
  );

  useEffect(() => {
    if (!focusedField || !isEditing) return;

    const target =
      focusedField === 'current'
        ? currentInputRef.current
        : focusedField === 'new'
        ? newInputRef.current
        : confirmInputRef.current;

    if (!target) return;

    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      const len = target.value.length;
      try {
        target.setSelectionRange(len, len);
      } catch {}
    });
  }, [focusedField, isEditing, currentPassword, newPassword, confirmPassword]);

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
            <InputWrapper label="Current password" htmlFor="current-password">
              <div className="flex items-center rounded border border-gray-300 p-2">
                <input
                  id="current-password"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onFocus={() => setFocusedField('current')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 border-none bg-transparent text-sm outline-none"
                  autoComplete="current-password"
                  ref={currentInputRef}
                />
                <ToggleButton onClick={() => setShowCurrent((prev) => !prev)} active={showCurrent} />
              </div>
            </InputWrapper>
          )}

          <InputWrapper label="New password" htmlFor="new-password">
            <div className="flex items-center rounded border border-gray-300 p-2">
                <input
                  id="new-password"
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onFocus={() => setFocusedField('new')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 border-none bg-transparent text-sm outline-none"
                  autoComplete="new-password"
                  ref={newInputRef}
                />
              <ToggleButton onClick={() => setShowNew((prev) => !prev)} active={showNew} />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Minimum 12 characters. Include upper, lower, number, and special character.
            </p>
          </InputWrapper>

          <InputWrapper label="Confirm new password" htmlFor="confirm-password">
            <div className="flex items-center rounded border border-gray-300 p-2">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 border-none bg-transparent text-sm outline-none"
                  autoComplete="new-password"
                  ref={confirmInputRef}
                />
              <ToggleButton onClick={() => setShowConfirm((prev) => !prev)} active={showConfirm} />
            </div>
          </InputWrapper>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : hasPassword ? 'Update Password' : 'Set Password'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            {initialising
              ? 'Loading...'
              : hasPassword
              ? ''
              : 'You currently sign in via Google. Add a password for backup access.'}
          </div>
          <Button type="button" onClick={beginEdit} disabled={initialising}>
            {hasPassword ? 'Change Password' : 'Set Password'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default PasswordSettings;
