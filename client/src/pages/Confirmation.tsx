import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import Cookies from "js-cookie";

const Confirmation = () => {
  const { confirmationToken } = useParams();
  const { axios, navigate } = useAppContext();
  const [status, setStatus] = useState<"validating" | "success" | "error">("validating");

  useEffect(() => {
    const confirmAccount = async () => {
      try {

        console.log(confirmationToken);
        const response = await axios.post(`/api/signup/validate/${confirmationToken}`);

        const data = response.data;

        // Example: save JWT in localStorage
        if (data?.token) {
            Cookies.set("token", data?.token, { expires: 7, sameSite: "Strict" });
        }

        setStatus("success");

        // Redirect after a short delay
        setTimeout(() => navigate("/login"), 1500);
      } catch (error) {
        console.error(error);
        setStatus("error");
      }
    };

    if (confirmationToken) {
      confirmAccount();
    }
  }, [confirmationToken, axios, navigate]);

  return (
    <div className="flex justify-center items-center h-screen">
      {status === "validating" && <p>Validating your account...</p>}
      {status === "success" && <p>Account confirmed! Redirecting...</p>}
      {status === "error" && <p>Invalid or expired confirmation link.</p>}
    </div>
  );
};

export default Confirmation;
