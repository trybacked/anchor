export function filterValueMatches(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false;
    }
    const actualSet = new Set(actual.map((entry) => String(entry)));
    return expected.every((entry) => actualSet.has(String(entry)));
  }
  return String(actual) === String(expected);
}

export function filterMatches(actualFilters, expected) {
  return actualFilters.some(
    (filter) =>
      filter.propertyId === expected.propertyId &&
      filter.op === expected.op &&
      filterValueMatches(filter.value, expected.value) &&
      (expected.objectId === undefined || filter.objectId === expected.objectId),
  );
}

export function monthFilterMatches(actualFilters, months) {
  const monthSet = new Set(months.map(String));
  return actualFilters.some((filter) => {
    if (filter.propertyId !== "source_year_month") {
      return false;
    }
    if (filter.op === "eq" && monthSet.has(String(filter.value))) {
      return true;
    }
    if (filter.op === "in" && Array.isArray(filter.value)) {
      return filter.value.some((entry) => monthSet.has(String(entry)));
    }
    return false;
  });
}

export function joinMatches(actualJoins, expectedJoins) {
  if (expectedJoins === undefined || expectedJoins.length === 0) {
    return true;
  }
  const ids = new Set((actualJoins ?? []).map((join) => join.relationshipId));
  return expectedJoins.every((join) => ids.has(join.relationshipId));
}

export function parseCount(rows) {
  const raw = rows[0]?.["count"];
  if (typeof raw === "number") return raw;
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "string") return Number(raw);
  return NaN;
}

const EXECUTION_ONLY_KEYS = new Set([
  "countEquals",
  "countMin",
  "minResultRows",
  "minProvenanceRows",
  "sqlIncludes",
]);

export function assertPlanShape(expectation, answer, error) {
  const failures = assertCase(expectation, answer, error, { planOnly: true });
  return failures;
}

export function assertCase(expectation, answer, error, options = {}) {
  const planOnly = options.planOnly === true;
  const failures = [];

  if (expectation.shouldFail === true) {
    if (error === undefined) {
      failures.push("expected planner/validation failure but ask succeeded");
      return failures;
    }
    if (expectation.failType !== undefined && error.name !== expectation.failType) {
      failures.push(`expected ${expectation.failType}, got ${error.name}: ${error.message}`);
    }
    return failures;
  }

  if (error !== undefined) {
    failures.push(`${error.name}: ${error.message}`);
    return failures;
  }

  if (answer === undefined) {
    failures.push("missing answer");
    return failures;
  }

  if (expectation.route !== undefined && answer.route !== expectation.route) {
    failures.push(`route ${String(answer.route)} !== ${expectation.route}`);
  }
  if (expectation.templateId !== undefined && answer.templateId !== expectation.templateId) {
    failures.push(`templateId ${String(answer.templateId)} !== ${expectation.templateId}`);
  }

  const query = answer.plan.objectQuery;
  if (expectation.objectId !== undefined && query.objectId !== expectation.objectId) {
    failures.push(`objectId ${query.objectId} !== ${expectation.objectId}`);
  }
  if (expectation.mode !== undefined) {
    const mode = answer.result?.mode ?? query.mode;
    if (mode !== expectation.mode) {
      failures.push(`mode ${String(mode)} !== ${expectation.mode}`);
    }
  }
  if (expectation.maxAttempts !== undefined && answer.attempts > expectation.maxAttempts) {
    failures.push(`attempts ${String(answer.attempts)} > ${String(expectation.maxAttempts)}`);
  }
  if (expectation.filtersInclude !== undefined) {
    for (const filter of expectation.filtersInclude) {
      if (!filterMatches(query.filters ?? [], filter)) {
        failures.push(`missing filter ${JSON.stringify(filter)}`);
      }
    }
  }
  if (expectation.filtersIncludeMonths !== undefined) {
    if (!monthFilterMatches(query.filters ?? [], expectation.filtersIncludeMonths)) {
      failures.push(`missing month filter for ${JSON.stringify(expectation.filtersIncludeMonths)}`);
    }
  }
  if (expectation.groupByIncludes !== undefined) {
    const groupBy = query.groupBy ?? [];
    for (const propertyId of expectation.groupByIncludes) {
      if (!groupBy.includes(propertyId)) {
        failures.push(`groupBy missing ${propertyId} (got ${JSON.stringify(groupBy)})`);
      }
    }
  }
  if (expectation.aggregationsMin !== undefined) {
    const count = query.aggregations?.length ?? 0;
    if (count < expectation.aggregationsMin) {
      failures.push(`aggregations ${String(count)} < min ${String(expectation.aggregationsMin)}`);
    }
  }
  if (expectation.selectIncludesAny !== undefined) {
    const select = query.select ?? [];
    const hit = expectation.selectIncludesAny.some((needle) =>
      select.some((column) => column.includes(needle)),
    );
    if (!hit) {
      failures.push(
        `select ${JSON.stringify(select)} missing one of ${JSON.stringify(expectation.selectIncludesAny)}`,
      );
    }
  }

  if (planOnly) {
    if (
      expectation.maxRowCount !== undefined &&
      query.limit !== undefined &&
      query.limit > expectation.maxRowCount
    ) {
      failures.push(`plan limit ${String(query.limit)} > ${String(expectation.maxRowCount)}`);
    }
    if (!joinMatches(query.joins, expectation.joinsInclude)) {
      failures.push(
        `joins ${JSON.stringify(query.joins)} missing ${JSON.stringify(expectation.joinsInclude)}`,
      );
    }
    return failures;
  }

  if (expectation.sqlIncludes !== undefined) {
    const sql = answer.result.sql.toUpperCase();
    for (const fragment of expectation.sqlIncludes) {
      if (!sql.includes(fragment.toUpperCase())) {
        failures.push(`sql missing ${fragment}`);
      }
    }
  }
  if (
    expectation.minResultRows !== undefined &&
    answer.result.rowCount < expectation.minResultRows
  ) {
    failures.push(
      `result rows ${String(answer.result.rowCount)} < min ${String(expectation.minResultRows)}`,
    );
  }
  if (!joinMatches(query.joins, expectation.joinsInclude)) {
    failures.push(
      `joins ${JSON.stringify(query.joins)} missing ${JSON.stringify(expectation.joinsInclude)}`,
    );
  }
  if (expectation.maxRowCount !== undefined && answer.result.rowCount > expectation.maxRowCount) {
    failures.push(
      `rowCount ${String(answer.result.rowCount)} > ${String(expectation.maxRowCount)}`,
    );
  }
  if (
    expectation.minProvenanceRows !== undefined &&
    answer.provenance.length < expectation.minProvenanceRows
  ) {
    failures.push(
      `provenance rows ${String(answer.provenance.length)} < ${String(expectation.minProvenanceRows)}`,
    );
  }
  if (expectation.countEquals !== undefined) {
    const count = parseCount(answer.result.rows);
    if (count !== expectation.countEquals) {
      failures.push(`count ${String(count)} !== ${String(expectation.countEquals)}`);
    }
  }
  if (expectation.countMin !== undefined) {
    const count = parseCount(answer.result.rows);
    if (!Number.isFinite(count) || count < expectation.countMin) {
      failures.push(`count ${String(count)} < min ${String(expectation.countMin)}`);
    }
  }
  if (answer.result.sql.length === 0) {
    failures.push("empty compiled sql");
  }

  return failures;
}

export function partitionExpectationKeys(expectation) {
  const planKeys = [];
  const executionKeys = [];
  for (const key of Object.keys(expectation)) {
    if (EXECUTION_ONLY_KEYS.has(key)) {
      executionKeys.push(key);
    } else {
      planKeys.push(key);
    }
  }
  return { planKeys, executionKeys };
}
