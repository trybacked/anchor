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

export const coreCoverage: SharedCoverageOptions = withThresholds({
  lines: 70,
  branches: 70,
  statements: 70,
});

export const packageCoverage: SharedCoverageOptions = {
  ...coverageDefaults,
  reporter: ["text", "lcov"],
};

export const appCoverage: SharedCoverageOptions = {
  ...coverageDefaults,
  reporter: ["text"],
};
