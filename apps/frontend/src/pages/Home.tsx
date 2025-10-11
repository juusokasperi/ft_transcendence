import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { Link } from 'react-router-dom';
import Chat from '../components/Chat';
import SplitButton from '../components/ui/SplitButton';
import Navbar from '../components/Navbar';
import backgroundImg from '../assets/background.png';
import tetristImg from '../assets/tetrist.jpg';
import snakeImg from '../assets/snake.jpeg';

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.25,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' },
  },
};

const heroScreens = [
  {
    src: backgroundImg,
    alt: 'Pong showdown screenshot',
    className: 'z-30 -translate-x-4 -translate-y-6 rotate-1 shadow-indigo-900/40',
  },
  {
    src: tetristImg,
    alt: 'Tetris game teaser',
    className: 'z-20 translate-x-6 translate-y-4 -rotate-3 shadow-purple-900/40',
  },
  {
    src: snakeImg,
    alt: 'Snake classic preview',
    className: 'z-10 -translate-x-2 translate-y-12 rotate-6 shadow-blue-900/40',
  },
];

const games = [
  {
    title: 'Pong',
    desc: 'Real-time duels with players across the globe and live leaderboards.',
    available: true,
    accent: 'from-indigo-500 to-purple-500',
    link: '/ping-pong',
  },
  {
    title: 'Tetris',
    desc: 'The classic block-dropper reimagined with competitive seasons. Coming soon.',
    available: false,
    accent: 'from-fuchsia-500 to-rose-500',
  },
  {
    title: 'Snake',
    desc: 'Retro snake with modern twists, power-ups, and shared scoreboards. Coming soon.',
    available: false,
    accent: 'from-emerald-500 to-teal-500',
  },
];

const Hero: React.FC = () => {
  const [chatOpen, setChatOpen] = useState(false);
  const { axios, user } = useAppContext();

  return (
    <>
      <Navbar />
      <motion.div
        className="min-h-[calc(100vh-6rem)] bg-slate-950 text-white"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        >
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-indigo-600/30 via-indigo-400/10 to-transparent blur-3xl" />
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pb-20 pt-28 sm:px-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-12">
          <motion.div className="space-y-6" variants={itemVariants}>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Arcade hub
            </span>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl md:text-5xl">
              Compete, climb, and conquer the arcade.
            </h1>
            <p className="max-w-xl text-base text-slate-200/80 sm:text-lg">
              Pick a game, challenge friends, and keep track of every win. Multiple classics are on
              the way, each with competitive ladders and seasonal rewards.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to={user ? '/profile' : '/signup'}
                className="flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400"
              >
                {user ? 'Go to your profile' : 'Create your arcade account'}
              </Link>
              <Link
                to="/ping-pong"
                className="flex items-center justify-center rounded-full border border-indigo-400/60 px-6 py-3 text-sm font-semibold text-indigo-200 transition hover:border-indigo-300 hover:text-white"
              >
                Jump into Pong
              </Link>
            </div>
          </motion.div>

          <motion.div
            className="mx-auto flex w-full max-w-sm flex-col items-center gap-8 sm:max-w-md lg:max-w-lg"
            variants={itemVariants}
          >
            <div className="relative flex h-64 w-full items-center justify-center sm:h-72 lg:h-[22rem]">
              <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-indigo-500/30 via-transparent to-purple-500/20 blur-3xl" />
              {heroScreens.map((screen, index) => (
                <motion.img
                  key={screen.src}
                  src={screen.src}
                  alt={screen.alt}
                  className={`absolute h-44 w-72 rounded-3xl border border-white/5 object-cover shadow-2xl sm:h-52 sm:w-80 lg:h-60 lg:w-[22rem] ${screen.className}`}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.12, duration: 0.45, ease: 'easeOut' }}
                />
              ))}
            </div>
            <div className="mt-2 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-xs font-medium text-slate-200 shadow-lg shadow-indigo-900/40 backdrop-blur sm:mt-6">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Live matches
              </span>
              <span className="text-slate-400">12 active</span>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6 lg:px-12"
          variants={itemVariants}
        >
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Featured games</h2>
              <p className="text-sm text-slate-300/70">
                Discover what&apos;s live now and what&apos;s launching next in the arcade.
              </p>
            </div>
            {user ? (
              <Link
                to="/profile/stats"
                className="text-sm font-semibold text-indigo-300 hover:text-white"
              >
                View your stats →
              </Link>
            ) : (
              <Link to="/login" className="text-sm font-semibold text-indigo-300 hover:text-white">
                Sign in to track stats →
              </Link>
            )}
          </div>

          <div className="space-y-6">
            {games.map((game) => (
              <div
                key={game.title}
                className="flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-lg shadow-indigo-950/20 ring-1 ring-white/5 transition hover:shadow-indigo-900/30 sm:flex-row"
              >
                <div className={`h-1 w-full bg-gradient-to-r ${game.accent} sm:h-auto sm:w-1`} />
                <div className="flex flex-1 flex-col gap-4 p-6 sm:p-8">
                  <div>
                    <h3 className="text-xl font-semibold sm:text-2xl">{game.title}</h3>
                    <p className="mt-2 text-sm text-slate-200/80 sm:text-base">{game.desc}</p>
                  </div>
                  <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:items-center">
                    {game.available ? (
                      <Link
                        to={game.link ?? '#'}
                        className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400"
                      >
                        Play now
                      </Link>
                    ) : (
                      <span className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-slate-300/70">
                        Coming soon
                      </span>
                    )}
                    <span className="text-xs uppercase tracking-[0.25em] text-slate-500">
                      {game.available ? 'Live' : 'In development'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </>
  );
};

export default Hero;
