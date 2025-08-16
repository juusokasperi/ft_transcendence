import React from 'react'
import { motion } from 'framer-motion'
import type {Variants } from 'framer-motion'
import { useAppContext } from '../context/AppContext' 
import { Link } from 'react-router-dom'

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.4,
      delayChildren: 0.9,
    },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.7, ease: 'easeOut' }
  },
}

const Hero: React.FC = () => {
  const { user } = useAppContext()

  return (
    <motion.div
      className='flex flex-col items-start justify-center px-6 
      md:px-16 lg:px-24 xl:px-32 text-white bg-[url("/src/assets/background.png")] bg-no-repeat
      bg-cover bg-center h-screen'
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.p 
        className='bg-white/10 text-white tracking-wide uppercase text-sm font-semibold px-4 py-1 border border-white/30 rounded-sm mt-20 backdrop-blur-md'
        variants={itemVariants}
      >
        Welcome
      </motion.p>

      <motion.p 
        className='font-serif text-2xl md:text-5xl md:text-[46px] md:leading-[46px] max-w-xl mt-4' 
        variants={itemVariants}
      >
        Play, compete, and enjoy your gaming experience.
      </motion.p>

      <motion.div variants={itemVariants} className="mt-8">
        
        <Link to={user ? '/game' : '/signup'}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold transition"
        >
          {user ? 'Play a Game' : 'Sign Up'}
        </Link>
      </motion.div>
    </motion.div>
  )
}

export default Hero
