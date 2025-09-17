import React, { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { PLACEHOLDER, resolveAvatarUrl } from '../utils/avatarUrl';

interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const Profile: React.FC = () => {
  const { axios, user, setUser, logout } = useAppContext();

  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(PLACEHOLDER);
  const [username, setUsername] = useState<string>('');
  const [newPassword, setNewPasswords] = useState<PasswordState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    const url = resolveAvatarUrl(user?.avatar, axios.defaults.baseURL);
    console.log('Profile resolved avatar URL =', url);
    setImagePreview(url);
  }, [user?.avatar, axios.defaults.baseURL]);

  // Handle image selection
  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const file = e.target.files[0] ?? null;
    console.log(file);
    setImage(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleUsernameChange = async () => {
    try {
      if (!username) return;
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
            },
      );
      toast.success('Account username changed');
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      const message = axiosErr?.response?.data?.error;
      toast.error(String(message));
    }
  };

  const handlePasswordChange = async () => {
    try {
      if (!newPassword.newPassword || !newPassword.currentPassword || !newPassword.confirmPassword)
        return;
      await axios.patch('/api/users/me/password', {
        newPassword: newPassword.newPassword,
        currentPassword: newPassword.currentPassword,
      });
      toast.success('Account password changed');
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      const message = axiosErr?.response?.data?.error;
      toast.error(String(message));
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      await handleUsernameChange();
      await handlePasswordChange();

      if (image) {
        const formData = new FormData();
        formData.append('avatar', image);

        const res = await axios.patch('/api/users/me/avatar', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        // backend returns res.data.avatar (filename or url); update user & preview
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
              },
        );
        setImagePreview(resolveAvatarUrl(res.data.avatar, axios.defaults.baseURL));
        toast.success('Account avatar has been changed');
      }
    } catch (err: any) {
      const axiosErr = err as AxiosError<{ error?: string }>;
      toast.error(String(axiosErr?.response?.data?.error || 'Update failed'));
    } finally {
      setLoading(false);
    }
  };

  // Delete account
  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your account?')) return;
    try {
      await axios.delete(`/api/users/me`);
      toast.success('Account deleted');
      await logout();
      // redirect or logout logic here
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="mx-auto mt-12 max-w-md rounded bg-white p-6 shadow">
      <h2 className="mb-6 text-2xl font-bold">Profile</h2>
      <form className="space-y-4">
        {/* Profile Image */}
        <div>
          <label className="mb-2 ml-3 block font-medium">Avatar</label>

          {imagePreview && (
            <img
              key={imagePreview}
              src={imagePreview}
              alt="Profile"
              className="mb-2 h-24 w-24 rounded-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
              }}
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full rounded border p-2"
          />
        </div>

        {/* Nickname */}
        <div>
          <label className="mb-2 block font-medium">Change Username</label>
          <input
            type="text"
            value={username}
            placeholder={user?.username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded border p-2"
          />
        </div>

        {/* Password */}
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
            className="w-full rounded border p-2"
          />
        </div>
        <div>
          <label className="mb-2 block font-medium">New Password</label>
          <input
            type="password"
            value={newPassword.newPassword}
            onChange={(e) => setNewPasswords({ ...newPassword, newPassword: e.target.value })}
            className="w-full rounded border p-2"
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
            className="w-full rounded border p-2"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <button
            type="submit"
            onClick={handleUpdate}
            disabled={loading}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Profile'}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
          >
            Delete Account
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;
