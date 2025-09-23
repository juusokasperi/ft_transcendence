import React, { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { PLACEHOLDER, resolveAvatarUrl } from '../utils/avatarUrl';
import TwoFactorSettings from '../components/TwoFactorSettings';

interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const Profile: React.FC = () => {
  const { axios, user, setUser } = useAppContext();

  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(PLACEHOLDER);
  const [username, setUsername] = useState<string>('');
  const [newPassword, setNewPasswords] = useState<PasswordState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const usernameRegex = /^(?!-)([a-zA-Z0-9-]+)(?<!-)$/;
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-=+[\]{};:|,<.>/?`]).{12,}$/;

  // Validation helpers
  const getUsernameValidation = () => {
    if (!username) return { state: '', msg: '' };
    if (usernameRegex.test(username)) return { state: 'valid', msg: '' };
    return {
      state: 'invalid',
      msg: 'Username may only contain letters, numbers, and dashes, and cannot start or end with a dash.',
    };
  };

  const getPasswordValidation = () => {
    if (!newPassword) return { state: '', msg: '' };

    if (newPassword.newPassword.length < 12) {
      return {
        state: 'weak',
        msg: 'Password is too short (minimum 12 characters required).',
      };
    }

    if (!passwordRegex.test(newPassword.newPassword)) {
      return {
        state: 'invalid',
        msg: 'Password must have uppercase, lowercase, a digit, and a special character.',
      };
    }
    return { state: 'valid', msg: '' };
  };

  const [loading, setLoading] = useState<boolean>(false);

  const baseUsername = user?.username ?? '';
  const isUsernameDirty = isEditing && username !== baseUsername;
  const isCurrentPasswordDirty = isEditing && newPassword.currentPassword.length > 0;
  const isNewPasswordDirty = isEditing && newPassword.newPassword.length > 0;
  const isConfirmPasswordDirty = isEditing && newPassword.confirmPassword.length > 0;
  const isAvatarDirty = isEditing && Boolean(image);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => {
    setImage(null);
    setUsername(baseUsername);
    setNewPasswords({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startEditing = () => {
    setError(null);
    setUsername(baseUsername);
    setNewPasswords({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setImage(null);
    setImagePreview(resolveAvatarUrl(user?.avatar, axios.defaults.baseURL));
    setIsEditing(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openAvatarPicker = () => {
    if (!isEditing) return;
    fileInputRef.current?.click();
  };

  useEffect(() => {
    const url = resolveAvatarUrl(user?.avatar, axios.defaults.baseURL);
    setImagePreview(url);
  }, [user?.avatar, axios.defaults.baseURL]);

  // Handle image selection
  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const file = e.target.files[0] ?? null;
    setImage(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleUsernameChange = async (): Promise<boolean> => {
    if (!username || username === baseUsername) return true;

    const userVal = getUsernameValidation();
    if (userVal.state !== 'valid') {
      setError(userVal.msg);
      return false;
    }

    try {
      const res = await axios.patch('/api/users/me', {
        newUsername: username,
      });
      setUser((prev) =>
        prev
          ? {
              ...prev,
              username: res.data.username,
              uuid: res.data.uuid,
              avatar: res.data.avatar ?? prev.avatar,
            }
          : {
              username: res.data.username,
              uuid: res.data.uuid,
              avatar: res.data.avatar ?? null,
              id: res.data.id ?? 0,
              email: res.data.email ?? '',
              wins: res.data.wins ?? 0,
              losses: res.data.losses ?? 0,
              createdAt: res.data.createdAt ?? '',
              tfaEnabled: Boolean(res.data.tfa ?? res.data.tfaEnabled ?? false),
            },
      );
      toast.success('Account username changed');
      return true;
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      const message = axiosErr?.response?.data?.error;
      toast.error(String(message));
      return false;
    }
  };

  const handlePasswordChange = async (): Promise<boolean> => {
    if (!newPassword.newPassword || !newPassword.currentPassword) return true;

    const passVal = getPasswordValidation();
    if (passVal.state !== 'valid') {
      setError(passVal.msg);
      return false;
    }
    if (newPassword.newPassword !== newPassword.confirmPassword) {
      setError('New password and confirmation do not match');
      return false;
    }

    try {
      await axios.patch('/api/users/me/password', {
        newPassword: newPassword.newPassword,
        currentPassword: newPassword.currentPassword,
      });
      toast.success('Account password changed');
      return true;
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      const message = axiosErr?.response?.data?.error;
      toast.error(String(message));
      return false;
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing) return;

    setLoading(true);
    setError(null);

    try {
      const usernameResult = await handleUsernameChange();
      const passwordResult = await handlePasswordChange();
      let avatarResult = true;

      if (image) {
        try {
          const formData = new FormData();
          formData.append('avatar', image);

          const res = await axios.patch('/api/users/me/avatar', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });

          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  avatar: res.data.avatar ?? prev.avatar,
                }
              : {
                  username: res.data.username,
                  uuid: res.data.uuid,
                  avatar: res.data.avatar ?? null,
                  id: res.data.id ?? 0,
                  email: res.data.email ?? '',
                  wins: res.data.wins ?? 0,
                  losses: res.data.losses ?? 0,
                  createdAt: res.data.createdAt ?? '',
                  tfaEnabled: Boolean(res.data.tfa ?? res.data.tfaEnabled ?? false),
                },
          );
          setImagePreview(resolveAvatarUrl(res.data.avatar, axios.defaults.baseURL));
          toast.success('Account avatar has been changed');
        } catch (err: any) {
          const axiosErr = err as AxiosError<{ error?: string }>;
          toast.error(String(axiosErr?.response?.data?.error || 'Avatar update failed'));
          avatarResult = false;
        }
      }

      if (usernameResult && passwordResult && avatarResult) {
        resetForm();
        setIsEditing(false);
      }
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      toast.error(String(axiosErr?.response?.data?.error || 'Update failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    resetForm();
    setImagePreview(resolveAvatarUrl(user?.avatar, axios.defaults.baseURL));
    setIsEditing(false);
  };

  // Delete account
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your account?')) return;
    try {
      await axios.delete(`/api/users/me`);
      toast.success('Confirmation email sent');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-6">
      <div className="rounded bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Profile</h2>
          {isEditing ? (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Edit Profile
            </button>
          )}
        </div>
        <form className="space-y-4" onSubmit={handleUpdate}>
          {/* Profile Image */}
          <div className="flex flex-col items-start">
            <div
              className={`relative inline-flex h-24 w-24 items-center justify-center rounded-full ${
                isEditing ? 'cursor-pointer' : ''
              } ${isAvatarDirty ? 'ring-4 ring-green-400/60' : ''}`}
              onClick={openAvatarPicker}
            >
              {imagePreview && (
                <img
                  key={imagePreview}
                  src={imagePreview}
                  alt="Profile"
                  className="h-full w-full rounded-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
                  }}
                />
              )}
              {isEditing && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openAvatarPicker();
                  }}
                  className={`absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full text-white shadow transition ${
                    isAvatarDirty ? 'bg-green-500 hover:bg-green-400' : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                  aria-label="Change avatar"
                >
                  <span className="text-2xl leading-none">+</span>
                </button>
              )}
            </div>
            {isEditing && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="sr-only"
              />
            )}
          </div>
          {error && isEditing && <p className="text-red-500">{error}</p>}

          {/* Nickname */}
          <div>
            {isEditing && <label className="mb-2 block font-medium">Change Username</label>}
            <input
              type="text"
              value={isEditing ? username : user?.username ?? ''}
              placeholder={user?.username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!isEditing}
              className={`w-full rounded border p-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isEditing ? '' : 'mt-2'
              } ${isUsernameDirty ? 'border-green-500 bg-green-50 ring-1 ring-green-400/60' : ''}`}
            />
          </div>

          {/* Password */}
          {isEditing && (
            <>
              <div>
                <label className="mb-2 block font-medium">Current Password</label>
                <input
                  type="password"
                  value={newPassword.currentPassword}
                  onChange={(e) =>
                    setNewPasswords({
                      ...newPassword,
                      currentPassword: e.target.value,
                    })
                  }
                  className={`w-full rounded border p-2 transition ${
                    isCurrentPasswordDirty ? 'border-green-500 bg-green-50 ring-1 ring-green-400/60' : ''
                  }`}
                />
              </div>
              <div>
                <label className="mb-2 block font-medium">New Password</label>
                <input
                  type="password"
                  value={newPassword.newPassword}
                  onChange={(e) => setNewPasswords({ ...newPassword, newPassword: e.target.value })}
                  className={`w-full rounded border p-2 transition ${
                    isNewPasswordDirty ? 'border-green-500 bg-green-50 ring-1 ring-green-400/60' : ''
                  }`}
                />
              </div>
              <div>
                <label className="mb-2 block font-medium">Confirm New Password</label>
                <input
                  type="password"
                  value={newPassword.confirmPassword}
                  onChange={(e) =>
                    setNewPasswords({
                      ...newPassword,
                      confirmPassword: e.target.value,
                    })
                  }
                  className={`w-full rounded border p-2 transition ${
                    isConfirmPasswordDirty ? 'border-green-500 bg-green-50 ring-1 ring-green-400/60' : ''
                  }`}
                />
              </div>
            </>
          )}

          {/* Buttons */}
          {isEditing && (
            <div className="flex items-center justify-between">
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-blue-500 px-4 py-2 text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Save Changes'}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
              >
                Delete Account
              </button>
            </div>
          )}
        </form>
      </div>
      <TwoFactorSettings axios={axios} user={user} setUser={setUser} />
    </div>
  );
};

export default Profile;
