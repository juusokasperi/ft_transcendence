import React from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { Link } from 'react-router-dom';

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.4,
      delayChildren: 0.6,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

const Hero: React.FC = () => {
  const { user } = useAppContext();

  return (
    <motion.div
      className='flex h-screen flex-col items-start justify-center bg-[url("/src/assets/background.png")] bg-cover bg-center bg-no-repeat px-6 text-white md:px-16 lg:px-24 xl:px-32'
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.p
        className="mt-20 rounded-sm border border-white/30 bg-white/10 px-4 py-1 text-sm font-semibold uppercase tracking-wide text-white backdrop-blur-md"
        variants={itemVariants}
      >
        Welcome
      </motion.p>

      <motion.p
        className="mt-4 max-w-xl font-serif text-2xl md:text-5xl md:text-[46px] md:leading-[46px]"
        variants={itemVariants}
      >
        Play, compete, and enjoy your gaming experience.
      </motion.p>

      <motion.div variants={itemVariants} className="mt-8">
        <Link
          to={user ? '/game' : '/signup'}
          className="rounded bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          {user ? 'Play a Game' : 'Sign Up'}
        </Link>
      </motion.div>
    </motion.div>
  );
};

export default Hero;
