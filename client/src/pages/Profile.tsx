import React, { useState, ChangeEvent, FormEvent, useEffect } from "react";
import { useAppContext } from "../context/AppContext";
import toast from "react-hot-toast";
import type { AxiosError } from "axios";

interface PasswordState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const Profile: React.FC = () => {
  const { axios, user,setUser ,getToken, logout, navigate} = useAppContext();

  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("src/assets/react.svg");
  const [username, setUsername] = useState<string>("");
  const [newPassword, setNewPasswords] = useState<PasswordState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });


  const [loading, setLoading] = useState<boolean>(false);

  const getImage = async () => {
    
    try {
      const res = await axios.get(`/uploads/${user?.avatar}`,
        {responseType:"blob",});
      setImagePreview(URL.createObjectURL(res.data));
      
    } catch (error) {
    }
  }

  useEffect(() => {
    console.log(user?.avatar)
    getImage();
  } ,[user]);



  // Handle image selection
  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const file = e.target.files[0];
    console.log(file);
    setImage(file);
    setImagePreview(URL.createObjectURL(file));

  };



  const handleUsernameChange = async () => {
    try {
        if (!username)
          return ;
        const token = getToken();
        const res = await axios.patch('/api/users/me',{
          newUsername:username,
        }, {
            headers: {
            Authorization: `Bearer ${token}`,
        },
        });
        setUser((prev) =>
        prev ? { ...prev, username: res.data.username} : res.data);
        toast.success("Account username changed");
    } catch (err: any) {
        const axiosErr = err as AxiosError<{error?:string}>;
        const message =
        axiosErr?.response?.data?.error;
        toast.error(String(message));
    }
  };

  const handlePasswordChange = async () => {
    try {
        if (!newPassword.newPassword || !newPassword.currentPassword || !newPassword.confirmPassword)
          return ;
        const token = getToken();
        await axios.patch('/api/users/me/password',{
          newPassword:newPassword.newPassword,
          currentPassword:newPassword.currentPassword
        }, {
            headers: {
            Authorization: `Bearer ${token}`,
        },
        });
        toast.success("Account password changed");
    } catch (err: any) {
        const axiosErr = err as AxiosError<{error?:string}>;
        const message =
        axiosErr?.response?.data?.error;
        toast.error(String(message));
    }
  };


  const handleUpdate = async (e: React.FormEvent) => {
    try {
      e.preventDefault(); // ✨ prevent form submission
      setLoading(true);
      await handleUsernameChange();
      await handlePasswordChange();
      if (image)
      {
        try{
          const token = await getToken();
          
          // Create a FormData instance
          const formData = new FormData();
          formData.append("avatar", image); // "avatar" is the field name expected by backend

          const res = await axios.patch("/api/users/me/avatar", formData, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data", // Axios sets the correct boundary automatically
            },
          });
         
        setUser((prev) =>
        prev ? { ...prev, avatar: res.data.avatar} : res.data);
        getImage();
        toast.success("Account avatar has been changed");
      }
      catch(err: any){
        setLoading(false);
        const axiosErr = err as AxiosError<{error?:string}>;
        const message =
          axiosErr?.response?.data?.error;
        toast.error(String(message));
        }
      }
      setLoading(false);
    } catch (err: any) {
        setLoading(false);
        const axiosErr = err as AxiosError<{error?:string}>;
        const message =
          axiosErr?.response?.data?.error;
        toast.error(String(message));
    }

  }

  // Delete account
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete your account?")) return;
    try {
      
        const token = getToken();
        await axios.delete(`/api/users/me`, {
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
            value={username}
            placeholder={user?.username}
            onChange={(e) => setUsername(e.target.value)}
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
            onClick={handleUpdate}
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
