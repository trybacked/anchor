# @backed/ingest

DuckDB wrapper Node (binding ufficiali). Legge sorgenti e produce tabelle queryabili.

**Responsabilità:**
- `read_csv_auto`, Excel, Parquet, JSON
- Postgres attach readonly, S3/HTTP
- Autodetect casi patologici italiani: win-1252, `;`, virgola decimale, header non riga 1
- **Segnalazione** di anomalie — mai fallire in silenzio

**Riuso:** adapters da `@backed/parsers` del repo precedente.

**Settimana:** 3–4
