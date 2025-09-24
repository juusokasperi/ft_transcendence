import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';

const PingPong: React.FC = () => {
  const navigate = useNavigate();

  const handleLocalPlay = () => navigate('/ping-pong/local');
  const handleOnlinePlay = () => navigate('/ping-pong/online');
  const handleTournaments = () => navigate('/ping-pong/tournaments');

  return (
    <div className="relative min-h-screen bg-black">
      <Navbar />
      <div className="relative h-screen w-full overflow-hidden pt-24">
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute left-0 top-0 h-full w-full bg-black object-contain object-[center_80%] md:object-cover"
        >
          <source src="/src/assets/gif.mp4" type="video/mp4" />
        </video>

        {/* Neon Menu */}
        <div className="relative z-10 flex h-full flex-col items-center justify-start space-y-8 pt-24">
          <button onClick={handleLocalPlay} className="neon-btn neon-pink">
            Play Local
          </button>

          <button onClick={handleOnlinePlay} className="neon-btn neon-blue">
            Play Online
          </button>

          <button onClick={handleTournaments} className="neon-btn neon-purple">
            Tournaments
          </button>
        </div>

        {/* Neon button styling */}
        <style>{`
        .neon-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: min(80vw, 18rem);
          padding: 1rem 3rem;
          font-size: 1.5rem;
          font-weight: bold;
          text-transform: uppercase;
          border: 2px solid currentColor;
          border-radius: 0.75rem;
          background: transparent;
          cursor: pointer;
          box-shadow:
            0 0 5px currentColor,
            0 0 10px currentColor,
            0 0 20px currentColor;
          transition: all 0.3s ease-in-out;
          letter-spacing: 0.1em;
        }

        .neon-btn:hover {
          box-shadow:
            0 0 10px currentColor,
            0 0 20px currentColor,
            0 0 40px currentColor,
            0 0 80px currentColor;
          transform: scale(1.05);
        }

        .neon-pink { color: #ff4d9d; }
        .neon-blue { color: #4dc9ff; }
        .neon-purple { color: #b48bff; }
      `}</style>
      </div>
    </div>
  );
};

export default PingPong;
