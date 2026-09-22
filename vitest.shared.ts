type CoverageThresholds = {
  lines?: number;
  branches?: number;
  functions?: number;
  statements?: number;
};

export type SharedCoverageOptions = {
  provider: "v8";
  reporter: string[];
  include: string[];
  exclude?: string[];
  thresholds?: CoverageThresholds;
};

const coverageDefaults: Omit<SharedCoverageOptions, "thresholds"> = {
  provider: "v8",
  reporter: ["text", "lcov"],
  include: ["src/**/*.ts"],
  exclude: ["src/generated/**", "src/**/types.ts", "src/types.ts"],
};

function withThresholds(thresholds: CoverageThresholds): SharedCoverageOptions {
  return { ...coverageDefaults, thresholds };
}

/** Published core — floor after the ontology module (~78% lines, ~73% branches). */
export const coreCoverage: SharedCoverageOptions = withThresholds({
  lines: 70,
  branches: 70,
  statements: 70,
});

/** Internal packages — full-tree coverage report (no gate). */
export const packageCoverage: SharedCoverageOptions = {
  ...coverageDefaults,
  reporter: ["text", "lcov"],
};

/** Apps and integration tests — coverage reported, no hard gate yet. */
export const appCoverage: SharedCoverageOptions = {
  ...coverageDefaults,
  reporter: ["text"],
};
