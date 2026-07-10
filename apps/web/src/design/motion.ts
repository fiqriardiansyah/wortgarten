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
  duration: 0.35,
  ease: 'easeOut',
  delay: index * 0.06,
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
