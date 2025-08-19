import React, { useState, ChangeEvent, FormEvent } from "react";
import { useAppContext } from "../context/AppContext";
import toast from "react-hot-toast";

interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const Profile: React.FC = () => {
  const { axios, user, getToken, logout} = useAppContext();

  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("src/assets/react.svg");
  const [nickname, setNickname] = useState<string>("");
  const [newPassword, setNewPasswords] = useState<PasswordState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState<boolean>(false);

  // Handle image selection
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const file = e.target.files[0];
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Delete account
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete your account?")) return;
    try {
        const uuid = user?.uuid;
        const token = getToken();
        await axios.delete(`/api/users/${uuid}`, {
            headers: {
            Authorization: `Bearer ${token}`,
        },
        });
        toast.success("Account deleted");
        logout();
      // redirect or logout logic here
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Delete failed");
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow rounded mt-10">
      <h2 className="text-2xl font-bold mb-6">Profile</h2>
      <form className="space-y-4">
        {/* Profile Image */}
        <div>
          <label className="block mb-2 ml-3 font-medium">Avatar</label>

          {imagePreview && (
            <img
              src={imagePreview}
              alt="Profile"
              className="w-24 h-24 object-cover rounded-full mb-2"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="border p-2 rounded w-full"
          />
        </div>

        {/* Nickname */}
        <div>
          <label className="block mb-2 font-medium">Change Username</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="border p-2 rounded w-full"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block mb-2 font-medium">Current Password</label>
          <input
            type="password"
            value={newPassword.currentPassword}
            onChange={(e) =>
              setNewPasswords({ ...newPassword, currentPassword: e.target.value })
            }
            className="border p-2 rounded w-full"
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">New Password</label>
          <input
            type="password"
            value={newPassword.newPassword}
            onChange={(e) =>
              setNewPasswords({ ...newPassword, newPassword: e.target.value })
            }
            className="border p-2 rounded w-full"
          />
        </div>
        <div>
          <label className="block mb-2 font-medium">Confirm New Password</label>
          <input
            type="password"
            value={newPassword.confirmPassword}
            onChange={(e) =>
              setNewPasswords({ ...newPassword, confirmPassword: e.target.value })
            }
            className="border p-2 rounded w-full"
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-between items-center">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Profile"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Delete Account
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;
