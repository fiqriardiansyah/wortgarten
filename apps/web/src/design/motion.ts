import type { Variants, Transition } from 'motion/react';

export const pressSpring: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 17,
};

export const pressVariants: Variants = {
  rest: { scale: 1 },
  pressed: { scale: 0.96 },
};

export const cardEnterVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export const cardEnterTransition = (index = 0): Transition => ({
  duration: 0.25,
  ease: 'easeOut',
  delay: index * 0.08,
});

export const ctaPulseVariants: Variants = {
  pulse: {
    scale: [1, 1.02, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const ringFillTransition: Transition = {
  duration: 0.8,
  ease: 'easeOut',
};

/** Linear progress bars fill on this exact timing per the sketch-theme spec (§7). */
export const progressFillTransition: Transition = {
  duration: 0.7,
  ease: 'easeOut',
};

/** Swap animation for the worlds detail panel — an overshoot ease gives the incoming panel a
 * wave-like settle instead of a flat slide. Exit stays a plain quick fade so the bounce only
 * ever plays on the way in. */
export const worldSwitchVariants: Variants = {
  enter: { opacity: 0, y: 24 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] },
  },
  exit: {
    opacity: 0,
    y: -16,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};
