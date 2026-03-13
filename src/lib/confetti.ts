import confetti from 'canvas-confetti';

export const fireCelebration = () => {
  confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.6 },
    colors: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'],
    disableForReducedMotion: true,
  });
};
