// utils/feedback.js
export const playFeedback = () => {
  const audio = new Audio("/ding.mp3");
  audio.play().catch(() => {});
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
};

