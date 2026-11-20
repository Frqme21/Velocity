export const site = {
  name: "Velocity",
  title: "Velocity - First Person Parkour",
  description:
    "A first-person parkour game with real physics, responsive controls, and a live level editor.",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://velocity-game.pages.dev",
  gameUrl: process.env.NEXT_PUBLIC_GAME_URL ?? "https://play-velocity.pages.dev",
  video: "/physics_of_velocity.mp4",
  poster: "/video-poster.png",
  reel: [
    {
      label: "Levels 1-4",
      src: "/menu_levels1-4.mp4",
      poster: "/menu-levels1-4-poster.jpg",
    },
    {
      label: "Levels 4-8",
      src: "/levels4-8.mp4",
      poster: "/levels4-8-poster.jpg",
    },
  ],
  mark: "/logo-mark-transparent.png",
  wordmark: "/banner.png",
} as const;
