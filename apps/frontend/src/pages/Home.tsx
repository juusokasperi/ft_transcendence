import React from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { Link } from 'react-router-dom';

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.3,
      delayChildren: 0.4,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

const games = [
  {
    title: 'Ping Pong',
    desc: 'Play against others in real-time ping pong battles.',
    available: true,
    image: '/src/assets/background.png',
  },
  {
    title: 'Tetris',
    desc: 'Stack and clear blocks — coming soon!',
    available: false,
    image: '/src/assets/tetrist.jpg',
  },
  {
    title: 'Snake',
    desc: 'Eat, grow, and survive — coming soon!',
    available: false,
    image: '/src/assets/snake.jpeg',
  },
];

const Hero: React.FC = () => {
  const { user } = useAppContext();

  return (
    <motion.div
      className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-950 to-black px-6 text-white md:px-16 lg:px-24 xl:px-32"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.p
        className="mt-12 rounded-sm border border-white/30 bg-white/10 px-4 py-1 text-sm font-semibold uppercase tracking-wide text-white backdrop-blur-md"
        variants={itemVariants}
      >
        Welcome to
      </motion.p>
      <motion.img src="/src/assets/arcade.png" className="size-40" variants={itemVariants} />

      <motion.h1
        className="mt-4 text-center font-serif text-3xl md:text-5xl md:leading-tight"
        variants={itemVariants}
      >
        Choose your game and start playing!
      </motion.h1>

      <motion.div
        className="mt-12 grid w-full max-w-5xl grid-cols-1 gap-6 md:grid-cols-3"
        variants={itemVariants}
      >
        {games.map((game, i) => (
          <motion.div
            key={i}
            className={`flex transform flex-col overflow-hidden rounded-2xl border bg-white/10 shadow-lg backdrop-blur-md transition duration-300 hover:-translate-y-2 ${
              game.available ? 'hover:shadow-indigo-500/40' : 'opacity-80'
            }`}
            variants={itemVariants}
            whileHover={game.available ? { scale: 1.05 } : {}}
          >
            <div className="h-40 w-full bg-gray-900">
              <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                {game.title}
                {game.available && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-400"></span>
                )}
              </h2>
              <p className="mt-2 text-sm text-white/80">{game.desc}</p>
              <div className="mt-auto pt-4">
                {game.available ? (
                  <Link
                    to={'/ping-pong'}
                    className="inline-block w-full rounded bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-center font-semibold text-white transition hover:from-indigo-500 hover:to-purple-500"
                  >
                    {'Play Now'}
                  </Link>
                ) : (
                  <button
                    disabled
                    className="inline-block w-full cursor-not-allowed rounded bg-gray-700/60 px-4 py-2 text-center font-semibold text-white opacity-60"
                  >
                    Coming Soon
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
};

export default Hero;
