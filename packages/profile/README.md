# @backed/profile

Deterministic profiling via SQL. Zero LLM.

**Output:** `profile.json` — statistical evidence, input for everything downstream.

**Per column:** null%, distinct count, top values, distribution, patterns (VAT ID, fiscal code, dates, email, amounts), candidate keys.

**Per column pair:** value overlap → relation candidate with deterministic confidence.
