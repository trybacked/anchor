export type AuthoringDiffChange = {
  kind: "added" | "changed" | "removed" | "breaking";
  subject: string;
  detail: string;
};
