/**
 * Long prompt lists for the sealed battery (FID-2026-1101-087).
 *
 * These are data only and are re-exported from `battery.ts`, so the protocol
 * object, the request counts, and every existing import keep the same values.
 */

export const DETERMINISTIC_CANARIES: ReadonlyArray<{
  id: string;
  prompt: string;
  answer: string;
}> = [
  {
    id: "dc-1",
    prompt: "What is 2 + 2? Answer with only the number.",
    answer: "4",
  },
  {
    id: "dc-2",
    prompt: "What is 3 + 5? Answer with only the number.",
    answer: "8",
  },
  {
    id: "dc-3",
    prompt: "What is 10 - 4? Answer with only the number.",
    answer: "6",
  },
  {
    id: "dc-4",
    prompt: "What is 6 x 7? Answer with only the number.",
    answer: "42",
  },
  {
    id: "dc-5",
    prompt: "What is 9 + 1? Answer with only the number.",
    answer: "10",
  },
  {
    id: "dc-6",
    prompt: "What is 12 / 3? Answer with only the number.",
    answer: "4",
  },
  {
    id: "dc-7",
    prompt: "What is the capital of France? Answer with only the city.",
    answer: "Paris",
  },
  {
    id: "dc-8",
    prompt: "What is the capital of Japan? Answer with only the city.",
    answer: "Tokyo",
  },
  {
    id: "dc-9",
    prompt: "What is the opposite of hot? Answer with one word.",
    answer: "cold",
  },
  {
    id: "dc-10",
    prompt: "What is the opposite of up? Answer with one word.",
    answer: "down",
  },
  {
    id: "dc-11",
    prompt: "What color is a clear daytime sky? Answer with one word.",
    answer: "blue",
  },
  {
    id: "dc-12",
    prompt: "How many days are in a week? Answer with only the number.",
    answer: "7",
  },
  {
    id: "dc-13",
    prompt: "How many legs does a spider have? Answer with only the number.",
    answer: "8",
  },
  {
    id: "dc-14",
    prompt: "What is the first letter of the alphabet? Answer with one letter.",
    answer: "A",
  },
  {
    id: "dc-15",
    prompt:
      "At sea level, what is the boiling point of water in Celsius? Answer with only the number.",
    answer: "100",
  },
  {
    id: "dc-16",
    prompt:
      "What is the largest planet in the solar system? Answer with one word.",
    answer: "Jupiter",
  },
  {
    id: "dc-17",
    prompt:
      "What is the chemical formula for water? Answer with only the formula.",
    answer: "H2O",
  },
  {
    id: "dc-18",
    prompt: "What is 5 squared? Answer with only the number.",
    answer: "25",
  },
  {
    id: "dc-19",
    prompt: "What is 100 divided by 4? Answer with only the number.",
    answer: "25",
  },
  {
    id: "dc-20",
    prompt: "What is 7 + 8? Answer with only the number.",
    answer: "15",
  },
];

export const STREAM_PROBES = [
  { id: "stream-plain", prompt: "Write one short sentence about the ocean." },
  {
    id: "stream-tool",
    prompt: "Call echo with the text 'stream check'.",
    tool: "echo",
  },
  {
    id: "stream-long",
    prompt: "Write a numbered list from 1 to 20, one item per line.",
  },
] as const;
