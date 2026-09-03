# pmi-minimal

Fixture sintetica per CI: mini PMI italiana (arredamento). **Tutti i dati sono inventati** — nessun dato reale.

| File | Encoding | Separatore | Casi patologici attesi |
|---|---|---|---|
| `clienti.csv` | Windows-1252 | `,` | Encoding non UTF-8 (città accentate: Forlì, Cefalù…), PIVA con zero iniziale, codici fiscali persona fisica, CF vuoti per le società |
| `fatture.csv` | UTF-8 | `;` | Virgola decimale (`1250,00`), date `gg/mm/aaaa`, separatore italiano |
| `prodotti.csv` | UTF-8 | `,` | Nessuno: caso base pulito, decimali con punto |

Relazione implicita: `fatture.cliente_id` → `clienti.id`.

**Segnalazioni ingest attese:**

- `clienti.csv` → `non_utf8_encoding`
- `fatture.csv` → `semicolon_delimiter`, `decimal_comma`

**Pattern attesi dal profiling:**

- `clienti.partita_iva` → `vat_number`, `clienti.codice_fiscale` → `fiscal_code`, `clienti.email` → `email`
- `fatture.data` → `date` (tipo DATE), `fatture.importo` → `amount` (tipo DOUBLE)
- `prodotti.prezzo` → `amount`

> Nota: `clienti.csv` è codificato Windows-1252 di proposito. Non risalvarlo in UTF-8
> (lo script di rigenerazione è documentato qui sotto).

```sh
# rigenerare l'encoding dopo una modifica (dal root del repo)
python3 -c "
from pathlib import Path
p = Path('fixtures/pmi-minimal/clienti.csv')
p.write_bytes(p.read_text(encoding='utf-8').encode('cp1252'))
"
```
