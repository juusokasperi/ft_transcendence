import placeHolderImg from '../assets/avatar-placeholder.svg';

export const PLACEHOLDER = placeHolderImg; // put any existing asset/public file

// Turn whatever is in user.avatar into a usable URL for <img src>
export function resolveAvatarUrl(avatar: string | undefined | null, axiosBase?: string): string {
  if (!avatar) return PLACEHOLDER;
  if (/^https?:\/\//i.test(avatar)) return avatar; // external (e.g. Google)
  const base = (axiosBase || '').replace(/\/+$/, ''); // strip trailing /
  const filename = avatar.replace(/^\/?uploads\//, ''); // avoid double /uploads
  return `${base}/uploads/${filename}`;
}
