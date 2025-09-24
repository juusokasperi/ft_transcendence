import React, { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { PLACEHOLDER, resolveAvatarUrl } from '../utils/avatarUrl';
import TwoFactorSettings from '../components/TwoFactorSettings';
import PasswordSettings from '../components/PasswordSettings';
import Button from '../components/Button';
import { validateUsername } from '../utils/validation';

const Profile: React.FC = () => {
  const { axios, user, setUser } = useAppContext();

  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(PLACEHOLDER);
  const [username, setUsername] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);

  const baseUsername = user?.username ?? '';
  const isUsernameDirty = isEditing && username !== baseUsername;
  const isAvatarDirty = isEditing && Boolean(image);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => {
    setImage(null);
    setUsername(baseUsername);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startEditing = () => {
    setError(null);
    setUsername(baseUsername);
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

    const userVal = validateUsername(username);
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

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing) return;

    setLoading(true);
    setError(null);

    try {
      const usernameResult = await handleUsernameChange();
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

      if (usernameResult && avatarResult) {
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

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your account?')) return;
    try {
      await axios.delete(`/api/users/me`);
      toast.success('Confirmation email sent');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const wins = user?.wins ?? 0;
  const losses = user?.losses ?? 0;

  return (
    <div className="relative min-h-[calc(100vh-6rem)] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-indigo-600/30 via-purple-500/10 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-48 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-52 w-52 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-6 sm:px-6 lg:px-10">
        <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl shadow-indigo-950/30 backdrop-blur">
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold sm:text-4xl">Account overview</h1>
              <p className="text-sm text-slate-300/80">
                Update your avatar, adjust your nickname, and manage account controls.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-200">
                Wins {wins}
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-slate-200">
                Losses {losses}
              </span>
            </div>
          </header>

          <form className="grid gap-8 lg:grid-cols-[auto,1fr]" onSubmit={handleUpdate}>
            <div className="flex flex-col items-center gap-4">
              <div
                className={`relative inline-flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/10 bg-slate-800/80 ${
                  isEditing ? 'cursor-pointer transition hover:ring-4 hover:ring-indigo-400/60' : ''
                } ${isAvatarDirty ? 'ring-4 ring-emerald-400/70' : ''}`}
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
                    className={`absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full text-white shadow shadow-indigo-950/30 transition ${
                      isAvatarDirty
                        ? 'bg-emerald-500 hover:bg-emerald-400'
                        : 'bg-indigo-600 hover:bg-indigo-500'
                    }`}
                    aria-label="Change avatar"
                  >
                    <span className="text-xl leading-none">+</span>
                  </button>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-lg font-semibold">{user?.username}</p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{user?.email}</p>
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

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-indigo-200">Profile status</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    {isEditing ? 'Editing mode active' : 'Viewing mode'}
                  </p>
                </div>
                {isEditing ? (
                  <Button
                    type="button"
                    variant="secondary"
                    tone="subtle"
                    onClick={handleCancelEdit}
                    withMinWidth={false}
                    className="rounded-full px-6 py-2 text-sm"
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={startEditing}
                    withMinWidth={false}
                    className="rounded-full px-6 py-2 text-sm"
                  >
                    Edit profile
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {isEditing && (
                  <label className="text-sm font-semibold text-slate-200">Change username</label>
                )}
                <input
                  type="text"
                  value={isEditing ? username : user?.username ?? ''}
                  placeholder={user?.username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!isEditing}
                  className={`w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-indigo-400/60 disabled:cursor-not-allowed disabled:opacity-60 ${
                    isUsernameDirty ? 'ring-2 ring-emerald-400/70' : ''
                  }`}
                />
                {error && isEditing && <p className="text-sm text-rose-400">{error}</p>}
              </div>

              {isEditing && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="submit"
                    disabled={loading}
                    withMinWidth={false}
                    variant="success"
                    className="flex-1 px-6 py-2 text-sm"
                  >
                    {loading ? 'Updating…' : 'Save changes'}
                  </Button>

                  <Button
                    type="button"
                    variant="danger"
                    tone="subtle"
                    onClick={handleDelete}
                    withMinWidth={false}
                    className="flex-1 px-6 py-2 text-sm"
                  >
                    Delete account
                  </Button>
                </div>
              )}
            </div>
          </form>
        </section>

        <PasswordSettings axios={axios} active={isEditing} />
        <TwoFactorSettings axios={axios} user={user} setUser={setUser} />
      </div>
    </div>
  );
};

export default Profile;
