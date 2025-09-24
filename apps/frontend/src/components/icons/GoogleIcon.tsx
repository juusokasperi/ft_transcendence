import React from 'react';

interface GoogleIconProps {
  className?: string;
}

const GoogleIcon: React.FC<GoogleIconProps> = ({ className = 'h-5 w-5' }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden={true}>
    <path
      fill="#4285F4"
      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3 2.3c1.7-1.6 2.7-3.9 2.7-6.5z"
    />
    <path
      fill="#34A853"
      d="M12 24c2.4 0 4.4-.8 5.9-2.2l-3-2.3c-.8.5-1.8.8-2.9.8-2.2 0-4.1-1.5-4.8-3.5l-3 .2C5.7 21.8 8.7 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M7.2 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8l-3-.2C3.4 11 3 11.9 3 13c0 1.1.4 2 1.2 3z"
    />
    <path
      fill="#EA4335"
      d="M12 7.5c1.3 0 2.5.4 3.4 1.3l2.6-2.6C16.4 4.7 14.4 4 12 4 8.7 4 5.7 6.1 4.3 9l3 2.2c.7-2 2.6-3.5 4.8-3.5z"
    />
  </svg>
);

export default GoogleIcon;
