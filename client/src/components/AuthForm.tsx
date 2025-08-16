import React, { useState } from "react";

interface AuthFormProps {
  type: "login" | "register";
  onSubmit: (data: { username: string; password: string; nickname?: string; confirmPassword?: string }) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ type, onSubmit }) => {
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username || !password || (type === "register" && !confirmPassword)) {
      setError("All fields are required.");
      return;
    }

    if (type === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // call container's onSubmit (container will call API / set context)
    onSubmit({
      username,
      password,
      nickname,
      confirmPassword: type === "register" ? confirmPassword : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-500">{error}</p>}
      {success && <p className="text-green-600">{success}</p>}

      <div>
        <label className="block mb-1 font-medium">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {type === "register" && (
        <div>
          <label className="block mb-1 font-medium">Nickname</label>
          <input
            type="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>
          )}

      <div>
        <label className="block mb-1 font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {type === "register" && (
        <div>
          <label className="block mb-1 font-medium">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
      >
        {type === "login" ? "Login" : "Register"}
      </button>
    </form>
  );
};

export default AuthForm;
