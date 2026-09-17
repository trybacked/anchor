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

/** Published SDK — Phase 0 floor from current baseline (~84% lines). */
export const anchorCoverage: SharedCoverageOptions = withThresholds({
  lines: 75,
  branches: 70,
  statements: 75,
  functions: 80,
});

/** Published core — Phase 0 floor from current baseline (~88% lines). */
export const coreCoverage: SharedCoverageOptions = withThresholds({
  lines: 70,
  branches: 84,
  statements: 70,
});

/** Internal packages — report coverage; thresholds added in Phase 3. */
export const packageCoverage: SharedCoverageOptions = {
  ...coverageDefaults,
  reporter: ["text", "lcov"],
};

/** Apps and integration tests — coverage reported, no hard gate yet. */
export const appCoverage: SharedCoverageOptions = {
  ...coverageDefaults,
  reporter: ["text"],
};
