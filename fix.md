# Anchor Ontology Engine Refactor Plan

## Context

Anchor is evolving into a focused ontology engine.

Its responsibility should be:

> **Structured datasets in → Governed, versioned operational ontology out.**

Anchor must not become a general-purpose data engineering platform.

Data ingestion, ETL, cleaning, normalization, record-level entity resolution, storage, and dataset management are responsibilities of upstream systems.

Anchor starts where curated structured datasets begin.

The system must remain completely domain-agnostic.

Do not hardcode concepts, entities, relationships, actions, rules, terminology, or assumptions belonging to any specific industry or domain.

---

# 1. Target Architecture

The conceptual architecture is:

```text
UPSTREAM DATA PLATFORM

Sources
→ Ingestion
→ Cleaning
→ Normalization
→ Entity Resolution
→ Curated Structured Datasets

                    ↓

ANCHOR

Dataset Inspection
→ Object Discovery
→ Property Discovery
→ Relationship Discovery
→ Logic Definition
→ Action Definition
→ Human Review
→ Validation
→ Versioning
→ Publication

                    ↓

VERSIONED OPERATIONAL ONTOLOGY

                    ↓

SDK / API / MCP / Applications / Agents
```

Anchor owns only the ontology layer.

---

# 2. Core Ontology Model

Anchor should model five fundamental primitives:

```text
Objects
Properties
Relationships
Logic
Actions
```

## Objects

Objects represent real-world concepts inferred or defined from datasets.

Example:

```yaml
objects:
  - id: customer
    name: Customer
```

Object names must never be hardcoded by Anchor.

---

## Properties

Properties describe objects.

```yaml
objects:
  - id: customer
    properties:
      - id: name
        type: string

      - id: created_at
        type: datetime
```

Anchor should support at least:

```text
string
integer
float
decimal
boolean
date
datetime
enum
json
reference
```

The type system should be extensible.

---

## Relationships

Relationships connect objects.

```yaml
relationships:
  - id: belongs_to
    from: Order
    to: Customer
    cardinality: many_to_one
```

Support:

```text
one_to_one
one_to_many
many_to_one
many_to_many
```

Relationships should contain evidence and provenance explaining how they were discovered or defined.

---

## Logic

Logic represents derived semantic or operational behavior.

```yaml
logic:
  - id: is_active
    object: Subscription
    expression: end_date > now()
```

Logic must be separate from raw properties.

The logic system should eventually support:

```text
derived properties
aggregations
conditions
business rules
computed states
validation rules
```

Do not assume any specific domain logic.

---

## Actions

Actions represent operations that can be performed against ontology objects.

```yaml
actions:
  - id: flag_object
    object: ExampleObject

    inputs:
      reason:
        type: string

    handler:
      type: webhook
```

Actions should eventually support:

```text
input schemas
validation
permissions
preconditions
handlers
side effects
audit logs
```

The action model must remain generic and extensible.

---

# 3. Remove Data Engineering Responsibilities From Anchor Core

Anchor should NOT be responsible for:

```text
general-purpose ingestion
ETL
data cleaning
data normalization
record-level entity resolution
data warehousing
data lake management
document parsing
PDF extraction
embedding pipelines
vector indexing
general-purpose data transformation
```

Existing functionality implementing these responsibilities should be:

1. identified,
2. isolated,
3. deprecated or moved outside the core architecture,
4. removed only when doing so does not unnecessarily destroy reusable components.

Do not perform a blind rewrite.

Reuse existing components when they fit the new architecture.

---

# 4. Dataset Input Contract

Define a clean abstraction between Anchor and upstream data platforms.

Anchor should operate against a generic interface such as:

```typescript
interface DatasetProvider {
  listDatasets(): Promise<Dataset[]>;

  getSchema(dataset: DatasetIdentifier): Promise<DatasetSchema>;

  getMetadata(dataset: DatasetIdentifier): Promise<DatasetMetadata>;

  getStatistics(dataset: DatasetIdentifier): Promise<DatasetStatistics>;

  sample?(dataset: DatasetIdentifier, options?: SampleOptions): Promise<DatasetSample>;
}
```

Anchor should be capable of working primarily from:

```text
dataset names
dataset descriptions
schemas
column names
column types
nullability
primary-key candidates
foreign-key candidates
statistics
cardinality
sample values
metadata
upstream provenance
```

Raw row access should not be mandatory unless required for a specific discovery operation.

---

# 5. Provider Architecture

Dataset access must use adapters.

```text
DatasetProvider

├── DatabricksProvider
├── PostgresProvider
├── SnowflakeProvider
├── BigQueryProvider
├── DuckDBProvider
└── future providers
```

The Anchor core must not depend on any specific provider.

Provider-specific behavior belongs inside provider packages.

---

# 6. Ontology Discovery Engine

Create a dedicated discovery engine.

Its job is to transform dataset information into ontology proposals.

```text
Datasets
   ↓
Schema Analysis
   ↓
Object Candidates
   ↓
Property Candidates
   ↓
Identifier Candidates
   ↓
Relationship Candidates
   ↓
Semantic Enrichment
   ↓
Ontology Proposal
```

Discovery should produce proposals, never silently establish uncertain facts as canonical truth.

Every discovered element should support:

```text
confidence
evidence
provenance
status
```

Example:

```yaml
relationships:
  - id: customer
    from: Order
    to: Customer

    confidence: 0.96

    evidence:
      - orders.customer_id
      - customers.id

    provenance:
      type: schema_analysis

    status: proposed
```

---

# 7. Human-in-the-Loop Review

Human review must be a first-class concept.

The lifecycle should be:

```text
DISCOVERED
↓
PROPOSED
↓
REVIEWED
↓
CONFIRMED
↓
PUBLISHED
```

Reviewers should be able to:

```text
accept
reject
rename
modify
merge
split
add
remove
override
```

ontology elements.

AI-generated ontology elements must be distinguishable from manually defined elements.

All decisions should be auditable.

---

# 8. Confidence and Evidence

Preserve and strengthen the existing confidence/evidence philosophy.

Each inferred ontology element should be able to explain:

```text
What was inferred?
Why was it inferred?
Which datasets support it?
Which fields support it?
Which algorithm/model proposed it?
What was the confidence?
Who confirmed it?
When was it confirmed?
```

Ontology generation should be explainable rather than opaque.

---

# 9. Ontology Specification

Create a canonical, provider-independent ontology specification.

For example:

```yaml
ontology:
  id: example
  version: 1

  objects: []

  relationships: []

  logic: []

  actions: []
```

Each ontology element should have stable identifiers.

Avoid making display names the primary identifiers.

The ontology specification must be:

```text
serializable
versionable
diffable
validatable
portable
human-readable
machine-readable
```

YAML may remain the human-facing representation, but the internal representation should not depend unnecessarily on YAML.

---

# 10. Ontology Validation

Implement validation as a dedicated subsystem.

Examples:

```text
duplicate object IDs
unknown property types
broken relationship targets
invalid cardinalities
invalid logic references
invalid action references
circular dependencies where prohibited
missing identifiers
invalid action input schemas
```

Expose validation through both the SDK and CLI.

Example:

```bash
anchor validate
```

---

# 11. Ontology Versioning

Ontology versioning must become first-class.

Support:

```text
Ontology v1
↓
Dataset or ontology changes
↓
Discovery
↓
Proposed Ontology v2
↓
Diff
↓
Review
↓
Publish
```

Example diff:

```diff
+ Object: Invoice

+ Relationship:
  Order → has_invoice → Invoice

~ Property:
  Customer.created
  datetime → date

- Property:
  Customer.legacy_code
```

The system should distinguish:

```text
additive changes
breaking changes
renames
type changes
relationship changes
logic changes
action changes
```

Provide APIs and CLI commands such as:

```bash
anchor diff
anchor validate
anchor publish
anchor rollback
```

---

# 12. Ontology Registry

Introduce the concept of an ontology registry.

It should track:

```text
ontology ID
versions
publication status
creation time
author
source datasets
dataset versions
review status
change history
```

Conceptually:

```text
Ontology
├── v1
├── v2
├── v3
└── v4 current
```

Published versions should be immutable.

Changes should produce new versions.

---

# 13. Separate Definition From Runtime

Anchor should clearly separate:

```text
ONTOLOGY DEFINITION
```

from:

```text
ONTOLOGY RUNTIME
```

Definition is responsible for:

```text
objects
properties
relationships
logic
actions
metadata
versions
```

Runtime is responsible for operating against that definition.

---

# 14. Ontology Runtime

Design a runtime capable of exposing ontology concepts programmatically.

Target capabilities:

```typescript
listObjectTypes();

getObjectType();

queryObjects();

getObject();

getRelatedObjects();

traverseRelationship();

evaluateLogic();

listActions();

executeAction();
```

The runtime should hide unnecessary details about the underlying physical datasets.

Applications should interact with ontology concepts rather than manually reconstructing dataset joins.

---

# 15. Action Runtime

Actions should eventually become executable.

Design an extensible handler architecture:

```text
Action
   ↓
Validation
   ↓
Authorization
   ↓
Preconditions
   ↓
Handler
   ↓
Side Effect
   ↓
Audit Event
```

Possible future handlers:

```text
webhook
HTTP API
function
queue
workflow engine
provider-specific operation
custom adapter
```

Do not couple the core action model to one execution technology.

---

# 16. MCP

Preserve MCP support, but make it ontology-native.

Target tools could include:

```text
list_object_types
get_object_type
search_ontology

get_object
query_objects
get_related_objects

get_relationship
traverse_relationship

evaluate_logic

list_actions
get_action
execute_action

get_ontology_version
get_ontology_diff
```

MCP should consume the same runtime APIs used by every other interface.

Do not implement separate ontology semantics specifically for MCP.

---

# 17. SDK

The SDK should expose the ontology as a programmable abstraction.

Example:

```typescript
const anchor = new Anchor(...)

const ontology = await anchor.ontology.load()

const customers = await ontology
  .objects("Customer")
  .query()

const customer = await ontology
  .objects("Customer")
  .get("customer_123")

const orders = await customer.related("orders")

await customer.action("flag").execute({
  reason: "manual review"
})
```

Exact API design should follow the language and conventions already used by the repository.

Do not force this exact syntax if a better abstraction fits the existing codebase.

---

# 18. CLI

Simplify the CLI around the ontology lifecycle.

Target mental model:

```bash
anchor connect

anchor inspect

anchor discover

anchor review

anchor validate

anchor diff

anchor publish

anchor serve
```

Each command should have a clear responsibility.

Avoid commands that mix ETL and ontology management.

---

# 19. Suggested Repository Structure

Evaluate restructuring toward something conceptually similar to:

```text
anchor/

packages/

  core/
    ontology/
    schema/
    validation/
    versioning/

  discovery/
    objects/
    properties/
    identifiers/
    relationships/
    logic/

  review/
    confidence/
    evidence/
    decisions/

  runtime/
    objects/
    relationships/
    query/
    logic/
    actions/

  providers/
    databricks/
    postgres/
    snowflake/
    duckdb/

  sdk/

  mcp/

apps/

  cli/

  review-ui/
```

Do not mechanically adopt this structure.

First inspect the existing repository and reuse its architecture where appropriate.

---

# 20. Preserve Valuable Existing Functionality

Before modifying anything, inspect the existing repository and identify reusable components.

In particular, preserve or evolve existing concepts around:

```text
model representation
provenance
confidence
review
diffing
validation
MCP
CLI
schema analysis
relationship discovery
```

The goal is architectural focus, not unnecessary code churn.

---

# 21. Migration Strategy

Do not rewrite the repository in one operation.

Use incremental phases.

## Phase 1

Establish the new core boundary.

Deliver:

```text
Ontology Spec
DatasetProvider interface
Object model
Property model
Relationship model
Validation
```

---

## Phase 2

Refactor discovery.

Deliver:

```text
dataset inspection
object discovery
property discovery
identifier discovery
relationship discovery
confidence
evidence
provenance
```

---

## Phase 3

Human review.

Deliver:

```text
proposal lifecycle
accept/reject/modify
review persistence
audit trail
```

---

## Phase 4

Versioning.

Deliver:

```text
ontology versions
semantic diff
breaking-change detection
publish
rollback
```

---

## Phase 5

Runtime.

Deliver:

```text
object querying
relationship traversal
logic evaluation
MCP integration
SDK
```

---

## Phase 6

Actions.

Deliver:

```text
action specification
validation
permissions abstraction
execution handlers
audit events
```

---

## Phase 7

Provider ecosystem.

Add providers only after the core abstractions are stable.

Providers must remain replaceable adapters.

---

# 22. First MVP

Do NOT attempt to implement the entire vision immediately.

The first useful milestone should be:

```text
Structured Dataset Provider
        ↓
Schema + Metadata
        ↓
Anchor Discovery
        ↓
Objects
Properties
Relationships
        ↓
Confidence + Evidence
        ↓
Human Review
        ↓
ontology.yaml
        ↓
Validation
        ↓
MCP
```

The MVP does NOT require:

```text
full action execution
complex logic engine
workflow engine
large UI
every data provider
domain-specific templates
custom ETL
```

Prove the ontology engine first.

---

# 23. Design Principles

All implementation decisions should follow these principles.

### Domain Agnostic

Never hardcode domain-specific ontology concepts.

### Provider Agnostic

Anchor must not depend conceptually on one data platform.

### Ontology First

Anchor models meaning, not ETL pipelines.

### Human Governed

Machine inference proposes. Humans can govern.

### Explainable

Every inferred element should have evidence and provenance.

### Versioned

Ontology changes must be explicit and traceable.

### Portable

The ontology should survive changes in the underlying data platform.

### Extensible

Objects, properties, relationships, logic, actions, providers, and runtimes should support extension.

### API First

CLI, MCP, SDK, and future UI should consume shared core APIs.

### Minimal Core

Do not introduce infrastructure that belongs upstream or downstream of the ontology layer.

---

# 24. Definition of Success

Anchor should eventually make this possible:

```text
Any structured data platform
          ↓
        Anchor
          ↓
Operational Ontology
          ↓
Applications / Agents / APIs
```

A developer should be able to connect Anchor to curated structured datasets and obtain a governed ontology containing:

```text
Objects
Properties
Relationships
Logic
Actions
```

without Anchor becoming responsible for the entire underlying data stack.

The ontology should remain understandable, inspectable, reviewable, versionable, portable, and executable.

---

# 25. Task For The Coding Agent

Before writing code:

1. Inspect the entire existing repository.
2. Map the current architecture and package boundaries.
3. Identify components that already satisfy parts of this specification.
4. Identify components that conflict with the new Anchor boundary.
5. Identify reusable code before proposing deletion.
6. Produce a concrete migration plan referencing actual files, modules, types, and dependencies.
7. Identify breaking API and CLI changes.
8. Propose the target internal architecture.
9. Break implementation into small, reviewable milestones.
10. Only then begin implementation.

Do not blindly implement this document literally.

Use it as the target product architecture while adapting the migration to the realities of the existing codebase.

The primary architectural rule is:

> **Anchor begins with curated structured datasets and ends with a governed operational ontology.**
