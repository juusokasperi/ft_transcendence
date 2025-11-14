import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Navbar from '../components/Navbar';

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <motion.div
        className="relative min-h-[calc(100vh-6rem)] pb-16 pt-28 text-white"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-indigo-600/30 via-indigo-400/10 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-40 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute bottom-24 right-12 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-12">
          <motion.div className="space-y-8 text-center" variants={itemVariants}>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">
              Lost in the arcade
            </span>

            <div className="space-y-4">
              <h1 className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-8xl font-bold leading-tight text-transparent sm:text-9xl">
                404
              </h1>
              <h2 className="text-2xl font-semibold text-white sm:text-3xl md:text-4xl">
                Page Not Found
              </h2>
              <p className="mx-auto max-w-xl text-base text-slate-200/80 sm:text-lg">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>

            <div className="pt-4">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-400 hover:to-purple-400"
              >
                Back to home
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default NotFound;
