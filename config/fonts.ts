import {
  JetBrains_Mono as FontMono,
  Orbitron,
  Rajdhani as FontSans,
} from "next/font/google";

export const fontSans = FontSans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rajdhani",
});

export const fontMono = FontMono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const fontDisplay = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
});
