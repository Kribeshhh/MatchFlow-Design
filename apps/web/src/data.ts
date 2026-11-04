export type GameId = "pubg" | "ml" | "ff" | "cs2" | "valorant" | "dota";
export const games: {
  id: GameId;
  name: string;
  short: string;
  category: string;
  tournaments: number;
  teams: number;
  color: string;
}[] = [
  {
    id: "pubg",
    name: "PUBG Mobile",
    short: "PUBG",
    category: "BATTLE ROYALE",
    tournaments: 12,
    teams: 248,
    color: "#d0b77c",
  },
  {
    id: "ml",
    name: "Mobile Legends",
    short: "MLBB",
    category: "5V5 MOBA",
    tournaments: 8,
    teams: 96,
    color: "#bfd2a3",
  },
  {
    id: "ff",
    name: "Free Fire",
    short: "FREE FIRE",
    category: "BATTLE ROYALE",
    tournaments: 4,
    teams: 64,
    color: "#b4774d",
  },
  {
    id: "cs2",
    name: "Counter-Strike 2",
    short: "CS2",
    category: "TACTICAL FPS",
    tournaments: 10,
    teams: 120,
    color: "#d4b875",
  },
  {
    id: "valorant",
    name: "Valorant",
    short: "VALORANT",
    category: "5V5 TACTICAL",
    tournaments: 14,
    teams: 168,
    color: "#de9a95",
  },
  {
    id: "dota",
    name: "Dota 2",
    short: "DOTA 2",
    category: "5V5 MOBA",
    tournaments: 6,
    teams: 72,
    color: "#cda190",
  },
];
export type Tournament = {
  id: number;
  game: GameId;
  title: string;
  status: string;
  teams: string;
  round: string;
  prize: string;
  location: string;
  date: string;
};
export const tournaments: Tournament[] = [
  {
    id: 1,
    game: "pubg",
    title: "Kathmandu Invitational",
    status: "LIVE",
    teams: "32 teams",
    round: "Quarter finals",
    prize: "100K",
    location: "Kathmandu, Nepal",
    date: "Today · 18:30 NPT",
  },
  {
    id: 2,
    game: "ml",
    title: "Nepal Championship",
    status: "REGISTRATION OPEN",
    teams: "18 / 32 teams",
    round: "Closes in 02D 14H",
    prize: "75K",
    location: "Online · Nepal",
    date: "October 12 · 17:00 NPT",
  },
  {
    id: 3,
    game: "ff",
    title: "Himalayan Showdown",
    status: "UP NEXT",
    teams: "24 teams",
    round: "Starts at 18:30",
    prize: "50K",
    location: "Online · South Asia",
    date: "Today · 18:30 NPT",
  },
  {
    id: 4,
    game: "pubg",
    title: "Valley Rivals: Season 04",
    status: "REGISTRATION OPEN",
    teams: "32 / 40 teams",
    round: "Closes in 02D 14H",
    prize: "60K",
    location: "Online · Nepal",
    date: "October 14 · 18:00 NPT",
  },
  {
    id: 5,
    game: "ml",
    title: "Land of Dawn Open",
    status: "LIVE",
    teams: "16 teams",
    round: "Semi finals",
    prize: "40K",
    location: "Online · South Asia",
    date: "Today · 19:00 NPT",
  },
  {
    id: 6,
    game: "ff",
    title: "Booyah Weekend Cup",
    status: "REGISTRATION OPEN",
    teams: "12 / 24 teams",
    round: "Closes in 01D 06H",
    prize: "25K",
    location: "Online · Nepal",
    date: "October 3 · 16:00 NPT",
  },
  {
    id: 7,
    game: "cs2",
    title: "Counter-Strike: Valley Major",
    status: "REGISTRATION OPEN",
    teams: "12 / 16 teams",
    round: "Closes in 03D 08H",
    prize: "150K",
    location: "Online · South Asia",
    date: "October 16 · 19:00 NPT",
  },
  {
    id: 8,
    game: "valorant",
    title: "Valorant: Nepal Nightfall",
    status: "LIVE",
    teams: "16 teams",
    round: "Semi finals",
    prize: "120K",
    location: "Kathmandu, Nepal",
    date: "Today · 20:00 NPT",
  },
  {
    id: 9,
    game: "dota",
    title: "Dota 2: Ancients Open",
    status: "REGISTRATION OPEN",
    teams: "8 / 16 teams",
    round: "Closes in 04D 12H",
    prize: "90K",
    location: "Online · Nepal",
    date: "October 18 · 18:00 NPT",
  },
];
