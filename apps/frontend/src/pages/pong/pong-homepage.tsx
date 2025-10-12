import React from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import gifImg from '../../assets/gif.mp4';
import {
  Card,
  PlayButton,
} from './pong-ui/local';

const PingPong: React.FC = () => {
  const navigate = useNavigate();

  const handleLocalPlay = () => navigate('/ping-pong/local');
  const handleOnlinePlay = () => navigate('/ping-pong/online');
  const handleTournaments = () => navigate('/ping-pong/tournaments');

  return (
    <div className="min-h-screen w-full">
      <Navbar />
      <div className="relative h-screen w-screen ">
        {/* Video Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute left-0 top-20 bg-black object-contain object-[center_80%] md:object-cover"
        >
          <source src={gifImg} type="video/mp4" />
        </video>

        {/* Menu */}
        <div className="absolute h-full w-full flex flex-col items-center justify-center p-6">
          <Card
            title={
              <span className="block w-full text-center text-2xl font-semibold">
                GAME MODES
              </span>
            }
          >
            {/* Game mode buttons */}
            <div className="mt-6 flex flex-col items-center gap-4">
              <PlayButton size="lg" color="limegreen" onClick={handleLocalPlay}>
                PLAY LOCAL
              </PlayButton>

              <PlayButton size="lg" color="cyan" onClick={handleOnlinePlay}>
                PLAY ONLINE
              </PlayButton>

              <PlayButton size="lg" color="magenta" onClick={handleTournaments}>
                TOURNAMENT
              </PlayButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PingPong;
