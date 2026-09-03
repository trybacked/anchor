# Fixtures

Cartelle di test anonimizzate per validare ingest + profile + semantic.

**Regole:**
- Mai committare dati reali di clienti
- Ogni fixture ha un `README.md` con origine, encoding, casi patologici attesi
- Target: 3 cartelle vere anonimizzate (compito commerciale settimana 2–3)

## Struttura prevista

```
fixtures/
├── pmi-minimal/          # fixture sintetica per CI
├── pmi-encoding-messy/   # win-1252, ;, virgola decimale
└── README.md
```
