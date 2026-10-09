import { generateText } from "ai";
import type { ModelResolver } from "./agent/run-agent.js";

export type GradedEvidence<T> = {
  item: T;
  grade: 0 | 1 | 2;
};

const MAX_GRADED_EXCERPTS = 12;
const GRADE_MARKER = /"id"\s*:\s*"([^"]+)"\s*,\s*"grade"\s*:\s*([0-2])/g;

function gradingPrompt(question: string, excerpts: readonly string[]): string {
  const blocks = excerpts
    .map((excerpt, index) => `[${String(index)}] ${excerpt.slice(0, 1_200)}`)
    .join("\n---\n");
  return [
    "Domanda: " + question,
    "",
    "Passaggi:",
    blocks,
    "",
    "Assegna a ogni passaggio un punteggio di rilevanza per la domanda:",
    "0 = irrilevante, 1 = parzialmente rilevante, 2 = direttamente rilevante.",
    "Rispondi SOLO con JSON, una riga per passaggio:",
    '{"id": "<indice>", "grade": <0|1|2>}',
  ].join("\n");
}

function parseGrades(raw: string, count: number): (0 | 1 | 2)[] | undefined {
  const grades = new Array<number>(count).fill(0);
  let matched = 0;
  for (const match of raw.matchAll(GRADE_MARKER)) {
    const index = Number.parseInt(match[1] ?? "", 10);
    const grade = Number.parseInt(match[2] ?? "", 10);
    if (Number.isInteger(index) && index >= 0 && index < count) {
      grades[index] = grade;
      matched += 1;
    }
  }
  if (matched === 0) {
    return undefined;
  }
  return grades.map((grade) => (grade === 2 ? 2 : grade === 1 ? 1 : 0));
}

export async function gradeEvidence<T>(
  question: string,
  items: readonly T[],
  excerptOf: (item: T) => string,
  resolveModel: ModelResolver,
  modelId: string,
): Promise<GradedEvidence<T>[]> {
  const gradedItems = items.slice(0, MAX_GRADED_EXCERPTS);
  if (gradedItems.length === 0) {
    return [];
  }
  let grades: (0 | 1 | 2)[] | undefined;
  try {
    const generation = await generateText({
      model: resolveModel(modelId),
      system:
        "Sei un valutatore di rilevanza documentale. Rispondi solo con il JSON richiesto, senza spiegazioni.",
      prompt: gradingPrompt(question, gradedItems.map(excerptOf)),
      temperature: 0,
      maxOutputTokens: 400,
    });
    grades = parseGrades(generation.text, gradedItems.length);
  } catch {
    grades = undefined;
  }
  const safeGrades = grades ?? gradedItems.map(() => 1 as const);
  return gradedItems
    .map((item, index) => ({ item, grade: safeGrades[index] ?? 0 }))
    .filter((entry): entry is GradedEvidence<T> => entry.grade > 0)
    .sort((left, right) => right.grade - left.grade);
}

export function hasUsableEvidence<T>(graded: readonly GradedEvidence<T>[]): boolean {
  return graded.length > 0;
}
