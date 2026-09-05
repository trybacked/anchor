# @backed/ingest

Node DuckDB wrapper (official bindings). Reads sources and produces queryable tables.

**Responsibilities:**
- CSV, Excel, Parquet, JSON, PDF, text, DOCX, ZIP, RAR
- Autodetect Italian market edge cases: win-1252, `;`, decimal comma, non-first-row headers
- **Report** anomalies — never fail silently

**Reuse:** adapters from `@backed/parsers` in the previous repo.
