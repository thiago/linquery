# Roadmap

Development phases for ORM.js.

## Table of Contents

- [Project Status](#project-status)
- [Phase 1: Core Foundation](#phase-1-core-foundation)
- [Phase 2: Basic Adapters](#phase-2-basic-adapters)
- [Phase 3: Relationships](#phase-3-relationships)
- [Phase 4: Signals](#phase-4-signals)
- [Phase 5: Offline-First & Sync](#phase-5-offline-first--sync)
- [Phase 6: Advanced Features](#phase-6-advanced-features)
- [Phase 7: Production Ready](#phase-7-production-ready)
- [Future Considerations](#future-considerations)

## Project Status

🚀 **Phase 1-5 Complete!** (Core + Relationships + Signals + Offline-First)

- ✅ Architecture designed and implemented
- ✅ API specification complete
- ✅ Documentation written and updated
- ✅ Core ORM implemented
- ✅ MemoryAdapter with field lookups (18 lookup types)
- ✅ Advanced type system with field autocomplete
- ✅ **Relationships: ForeignKey, OneToOneField complete**
- ✅ **select_related() and prefetch_related() working**
- ✅ **Reverse relations fully functional**
- ✅ **Signal system with lifecycle hooks**
- ✅ **GraphQL Adapter: Extensible adapter with 3 levels of customization**
- ✅ **CachedAdapter: Offline-first with configurable cache strategies**
- ✅ **SyncAdapter: Bidirectional sync with conflict resolution**
- ⏳ CI/CD pending
- ⏳ **Next: Phase 6 (Advanced Features)**

## Phase 1: Core Foundation

**Goal:** Implement the core ORM abstractions.

**Status:** 🟢 Complete (100%)

### Tasks

- [x] Project setup
  - [x] TypeScript configuration (strict mode)
  - [x] Build system (tsup)
  - [x] Testing framework (vitest)
  - [x] Linting (eslint, prettier)
  - [ ] CI/CD (GitHub Actions) - pending

- [x] Core abstractions
  - [x] `Model` base class with `Model.init()` pattern
  - [x] `Field` base class and basic field types
    - [x] `CharField` (with maxLength, minLength, validators)
    - [x] `TextField` (with maxLength)
    - [x] `IntegerField` (with min, max)
    - [x] `FloatField` (with min, max, precision)
    - [x] `BooleanField` (with default)
    - [x] `DateTimeField` (with autoNow, autoNowAdd)
    - [x] `DateField`
    - [x] `JSONField`
    - [x] `ChoiceField` (with choices validation)
  - [x] `Manager` class with create, get, getOrCreate, updateOrCreate
  - [x] `QuerySet` class with filter, order_by, limit, offset, first, last, count, exists
  - [x] Field lookups (`__gt`, `__gte`, `__contains`, etc.) - 18 lookup types implemented
  - [x] Model metadata system with Symbol-based storage

- [x] Type system ⭐ **Critical for DX**
  - [x] TypeScript type inference for field types
  - [x] Generic types for Model/QuerySet
  - [x] Field type definitions with `__type` phantom property
  - [x] Type declarations with `declare` keyword
  - [x] **Field name autocomplete** - implemented with TypedFilter<T>
  - [x] **Lookup autocomplete** - pragmatic approach allows all lookups
  - [x] **Type-safe filter values** - basic type safety with TypedFilter<T>
  - [ ] Conditional types for relationships - pending (Phase 3)
  - [x] Return type inference (toArray() returns T[], first() returns T | undefined)

- [x] Error handling
  - [x] Error class hierarchy (ModelValidationError, DoesNotExistError, MultipleObjectsReturnedError)
  - [x] DoesNotExist, MultipleObjectsReturned
  - [x] ValidationError with field details
  - [ ] AdapterError types - pending
  - [ ] SyncError types - pending (Phase 5)

- [x] Validation
  - [x] Field-level validation (required, min, max, maxLength, choices)
  - [x] Model-level validation (`clean()` method)
  - [x] Custom validators (function-based)
  - [x] Error handling with field-specific messages

**Deliverable:** ✅ Core ORM with Model.init() pattern, complete field validation, and basic querying

**Time Taken:** ~2 weeks (estimated)

## Phase 2: Basic Adapters

**Goal:** Implement MemoryAdapter to test core functionality.

**Status:** 🟢 Complete (100%)

### Tasks

- [x] Adapter interface
  - [x] Define `BackendAdapter` interface (connect, disconnect, create, find, update, delete, count, exists)
  - [x] Define `QueryPlan` structure (filters, ordering, limit, offset)
  - [x] Query compilation logic in QuerySet

- [x] MemoryAdapter
  - [x] In-memory storage using Map
  - [x] CRUD operations (create, find, update, delete, get, list, count)
  - [x] Query filtering (basic exact match)
  - [x] Field lookups (__gt, __contains, etc.) - 18 lookup types implemented
  - [x] Sorting (order_by with ascending/descending)
  - [x] Pagination (limit, offset)
  - [x] Auto-increment ID generation
  - [x] fromDB/toDB field serialization

- [x] Documentation
  - [x] Basic usage examples
  - [x] API documentation

**Deliverable:** ✅ Fully functional ORM with in-memory storage

**Time Taken:** ~1 week (estimated)

## Phase 3: Relationships

**Goal:** Implement ForeignKey, OneToOne, and ManyToMany.

**Status:** 🟢 **COMPLETE (100%)**

### Tasks

- [x] ForeignKey
  - [x] Field definition
  - [x] Lazy loading with property descriptors
  - [x] Eager loading (`select_related`)
  - [x] Reverse relations with QuerySet
  - [x] Cascade delete options (onDelete)

- [x] OneToOneField
  - [x] Similar to ForeignKey but unique
  - [x] Bidirectional access (single instance reverse)

- [x] ManyToManyField
  - [x] Basic field definition (placeholder for future full implementation)
  - [x] Documented for future through table implementation

- [x] Performance Optimizations
  - [x] `select_related()` for ForeignKey/OneToOne (JOIN-like behavior)
  - [x] `prefetch_related()` for reverse FK (batch loading)
  - [x] N+1 query prevention

**Deliverable:** ✅ **Complete relationship system with ForeignKey, OneToOne, select_related, prefetch_related, and reverse relations fully functional.**

**Note:** Full ManyToManyField implementation with through tables is deferred to future version.

**Time Taken:** ~1 week

**Completed:** January 2025

## Phase 4: Signals

**Goal:** Implement signal system for lifecycle hooks.

**Status:** 🟢 **COMPLETE (100%)**

### Tasks

- [x] Signal system
  - [x] `Signal` class
  - [x] Global signal registry
  - [x] `signal()` helper function

- [x] Model lifecycle signals
  - [x] `PRE_INIT`, `POST_INIT`
  - [x] `PRE_SAVE`, `POST_SAVE`
  - [x] `PRE_DELETE`, `POST_DELETE`
  - [x] `M2M_CHANGED` (defined, ready for future M2M implementation)

- [x] Signal integration
  - [x] Emit signals from Model methods
  - [x] Sender filtering
  - [x] Async signal handlers

- [x] Documentation
  - [x] Signal types exported from core
  - [x] Usage examples and patterns

**Deliverable:** ✅ **Complete signal system with lifecycle hooks (pre_init, post_init, pre_save, post_save, pre_delete, post_delete)**

**Time Taken:** ~1 day

**Completed:** January 2025

## Phase 5: Offline-First & Sync

**Goal:** Implement adapters for offline-first applications with sync capabilities.

**Status:** 🟢 **COMPLETE (100%)**

### Offline-First Adapters

We implemented **two complementary adapters** for different offline-first scenarios:

#### 1. CachedAdapter ✅ **COMPLETE**
**Use Case:** Fast UI with background updates (stale-while-revalidate pattern)

- [x] Configurable read strategies
  - [x] `cache-first` - Return cache immediately, no network call
  - [x] `network-first` - Try network first, fallback to cache
  - [x] `cache-then-network` - Return cache immediately, update in background
- [x] Configurable write strategies
  - [x] `network-first` - Try network first, queue if offline
  - [x] `cache-first` - Write to cache first, sync in background
- [x] Offline queue system
  - [x] Operation queuing (create, update, delete)
  - [x] Automatic retry with exponential backoff
  - [x] Queue persistence to cache backend
  - [x] Queue statistics and management
- [x] Signal-based events
  - [x] `cacheHit` - Data fetched from cache
  - [x] `networkFetch` - Data fetched from network
  - [x] `cacheUpdated` - Cache updated from network
  - [x] `operationQueued` - Operation queued for offline sync
  - [x] `operationSynced` - Queued operation synced successfully
  - [x] `syncFailed` - Sync operation failed
  - [x] `connectivityChanged` - Online/offline status changed
- [x] Smart cache merging
  - [x] Intelligent merge strategy for list operations
  - [x] Timestamp-based change detection
  - [x] Last-write-wins conflict resolution
- [x] Model registry for queue processing
- [x] Auto-registration of models during CRUD operations
- [x] Documentation (CACHED_ADAPTER.md)

**Best For:** Mobile apps, PWAs, fast UI experiences

#### 2. SyncAdapter ✅ **COMPLETE**
**Use Case:** Bidirectional sync with conflict resolution

- [x] Core infrastructure
  - [x] OperationQueue with persistence
  - [x] ConnectivityManager with listeners
  - [x] SyncEngine with push/pull/sync operations
- [x] Offline-first CRUD operations
  - [x] Local ID generation
  - [x] Automatic queuing when offline
  - [x] Auto-sync when online
- [x] Sync capabilities
  - [x] Push sync (local → remote)
  - [x] Pull sync (remote → local)
  - [x] Bidirectional sync
- [x] Conflict resolution strategies
  - [x] Last-write-wins
  - [x] Remote-wins
  - [x] Local-wins
  - [x] Custom resolver
- [x] Sync signals
  - [x] `pre_sync`, `post_sync`
  - [x] `sync_conflict`
  - [x] `connectivity_change`
- [x] ID mapping system
  - [x] Local ID to remote ID mapping
  - [x] Automatic ID resolution after sync
- [x] Model registry for sync operations
- [x] Retry logic with exponential backoff

**Best For:** Collaborative apps, multi-device sync, CRM systems

### Key Differences

| Feature | CachedAdapter | SyncAdapter |
|---------|---------------|-------------|
| **Primary Goal** | Fast UI with cache | Full bidirectional sync |
| **Read Strategy** | Configurable (cache-first, network-first, cache-then-network) | Always local-first |
| **Write Strategy** | Configurable (network-first, cache-first) | Always local-first, queue for sync |
| **Conflict Resolution** | Last-write-wins (simple) | Configurable strategies |
| **Use Case** | Mobile apps, PWAs | Collaborative apps, CRM |
| **Complexity** | Simple, straightforward | More complex, powerful |
| **Background Updates** | Yes (cache-then-network) | Yes (auto-sync) |

**Deliverable:** ✅ Complete offline-first solution with two complementary adapters

**Time Taken:** ~2 weeks

**Completed:** January 2025

## Phase 6: Advanced Features

**Goal:** Implement advanced query and ORM features.

**Status:** Not started

### Tasks

- [ ] Advanced queries
  - [ ] Q objects (OR, AND, NOT)
  - [ ] Aggregation (`Count`, `Sum`, `Avg`, etc.)
  - [ ] Grouping (`group_by`, `annotate`)
  - [ ] Subqueries
  - [ ] Raw queries with parameterization
  - [ ] `values()` and `values_list()` optimizations

- [ ] Advanced fields
  - [ ] `ArrayField`
  - [ ] `EnumField`
  - [ ] `UUIDField`
  - [ ] `FileField` / `ImageField`
  - [ ] Composite fields

- [ ] QuerySet features
  - [ ] `defer()`, `only()` (field selection)
  - [ ] `distinct()`
  - [ ] `union()`, `intersection()`, `difference()`
  - [ ] Query caching

- [ ] Model features
  - [ ] Model inheritance (abstract, multi-table)
  - [ ] Proxy models
  - [ ] Custom managers
  - [ ] Model methods and properties

- [ ] Transactions
  - [ ] Transaction API
  - [ ] Atomic operations
  - [ ] Savepoints

**Deliverable:** Feature-complete ORM

**Estimated Time:** 4-5 weeks

## Phase 7: Production Ready

**Goal:** Polish for production use.

**Status:** ⏳ Partially started (3 adapters complete)

### Tasks

- [x] **Additional adapters** (3/7 complete)
  - [ ] LocalStorageAdapter
  - [ ] DexieAdapter (IndexedDB)
  - [x] **GraphQLAdapter** ✨ **COMPLETE!**
    - [x] CRUD operations (create, find, update, delete)
    - [x] Count and exists support
    - [x] Configurable endpoint, headers, query names
    - [x] Field mapping (ORM ↔ GraphQL)
    - [x] Response path configuration
    - [x] Filter translation (18 lookup types)
    - [x] **3-level extensibility system:**
      - [x] Custom Queries (direct query strings)
      - [x] Query Builders (dynamic generation)
      - [x] Class Inheritance (override protected methods)
    - [x] Comprehensive documentation (GRAPHQL_ADAPTER_DESIGN.md, GRAPHQL_ADAPTER_EXAMPLES.md)
    - [x] Complete Hasura adapter example
  - [x] **CachedAdapter** ✨ **COMPLETE!**
    - [x] Configurable read/write strategies
    - [x] Offline queue with retry
    - [x] Signal-based events
    - [x] Documentation (CACHED_ADAPTER.md)
  - [x] **SyncAdapter** ✨ **COMPLETE!**
    - [x] Bidirectional sync
    - [x] Conflict resolution
    - [x] OperationQueue and ConnectivityManager
  - [ ] RESTAdapter
  - [ ] PostgresAdapter (via @orm-js/adapter-postgres)
  - [ ] MySQLAdapter
  - [ ] SQLiteAdapter

- [ ] Performance
  - [ ] Query optimization
  - [ ] N+1 query detection and warnings
  - [ ] Caching strategies (QuerySet cache)
  - [ ] Lazy loading optimization
  - [ ] Bundle size optimization (<50kb core)
  - [ ] Connection pooling (SQL adapters)
  - [ ] Batch operations optimization
  - [ ] Performance profiling tools

- [ ] Migrations (adapter-specific)
  - [ ] Migration file format
  - [ ] Schema versioning
  - [ ] Auto-generation from models
  - [ ] Up/Down migrations
  - [ ] Migration CLI commands
  - [ ] SQLAdapter migration support

- [ ] Developer experience
  - [ ] Better error messages (see ERRORS.md)
  - [ ] CLI tools
    - [ ] `orm-js init` - Project setup
    - [ ] `orm-js migrate` - Run migrations
    - [ ] `orm-js makemigrations` - Generate migrations
    - [ ] `orm-js introspect` - Generate models from DB
  - [ ] Debug logging with levels
  - [ ] Query logging and profiling

- [ ] Documentation
  - [x] Core documentation (README, ARCHITECTURE, API)
  - [x] TypeScript guide (TYPESCRIPT.md)
  - [x] Testing guide (TESTING.md)
  - [x] Error handling (ERRORS.md)
  - [x] Security guide (SECURITY.md)
  - [x] Adapters guide (ADAPTERS.md)
  - [x] Signals guide (SIGNALS.md)
  - [x] Sync guide (SYNC.md)
  - [x] Extensions guide (EXTENSIONS.md)
  - [x] **GraphQL Adapter design (GRAPHQL_ADAPTER_DESIGN.md)**
  - [x] **GraphQL Adapter examples (GRAPHQL_ADAPTER_EXAMPLES.md)**
  - [x] **Progress summary (PROGRESS_SUMMARY.md)**
  - [ ] Migration guide
  - [ ] Performance guide
  - [ ] Tutorial series
  - [ ] Recipe book (common patterns)
  - [ ] Comparison with other ORMs
  - [ ] Video guides

- [ ] Ecosystem
  - [ ] Framework integrations (React, Vue, Svelte)
  - [ ] DevTools
  - [ ] Adapter marketplace

- [ ] Release
  - [ ] npm package
  - [ ] Versioning strategy
  - [ ] Changelog
  - [ ] Migration guide

**Deliverable:** Production-ready v1.0.0

**Estimated Time:** 4-6 weeks

## Future Considerations

Features to consider after v1.0:

### Database Features
- [ ] Connection pooling
- [ ] Read replicas
- [ ] Sharding support
- [ ] Full-text search
- [ ] Geospatial queries

### Advanced Sync
- [ ] Operational transformation
- [ ] CRDT support
- [ ] P2P sync
- [ ] Blockchain/distributed ledger

### Developer Tools
- [ ] Visual query builder
- [ ] ORM inspector
- [ ] Performance profiler
- [ ] Schema visualizer

### Integrations
- [ ] GraphQL schema generation
- [ ] OpenAPI/Swagger integration
- [ ] Firebase adapter
- [ ] Supabase adapter
- [ ] PlanetScale adapter

### Language Support
- [ ] JavaScript-only version (no TypeScript requirement)
- [ ] JSDoc types for vanilla JS

### Advanced Features
- [ ] Soft deletes (built-in)
- [ ] Multi-tenancy
- [ ] Audit logging
- [ ] Versioning (temporal tables)
- [ ] Encryption at field level

## Milestones

### Milestone 1: Proof of Concept ✅ **ACHIEVED**
- Phase 1-4 complete (100%)
- Core ORM working with MemoryAdapter and GraphQLAdapter
- Model.init() pattern implemented
- Complete field validation
- Relationships (ForeignKey, OneToOne, select_related, prefetch_related)
- Signal system (lifecycle hooks)
- Field lookups (18 types)
- Advanced type system with field name autocomplete
- **Completed:** January 2025

### Milestone 2: Alpha Release ✅ **ACHIEVED**
- ✅ Phase 1-5 complete (100%)
- ✅ Core + Relationships + Signals + Offline-First
- ✅ GraphQL Adapter complete
- ✅ CachedAdapter complete
- ✅ SyncAdapter complete
- ✅ Comprehensive documentation
- **Completed:** January 2025

### Milestone 3: Beta Release ⏳ **NEXT**
- Phase 6 (Advanced Features)
- Q objects, aggregation, grouping
- Advanced fields
- ETA: ~8-10 weeks

### Milestone 4: v1.0.0 Release
- All phases complete
- Production ready
- Multiple SQL adapters
- ETA: ~16-18 weeks (~4 months)

## Contributing

We welcome contributions! Areas where help is needed:

### High Priority
- Adapter implementations
- Test coverage
- Documentation
- Examples

### Medium Priority
- Performance optimization
- Framework integrations
- Developer tools

### Low Priority
- Additional field types
- Advanced query features
- Ecosystem tools

## Communication

- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: Questions and community support
- Discord (future): Real-time chat
- Blog (future): Updates and tutorials

## Version History

### v0.2.0 ✅ **CURRENT** (Alpha Release)
- ✅ Core ORM with Model.init() pattern
- ✅ **Adapters:**
  - ✅ MemoryAdapter (in-memory storage)
  - ✅ GraphQLAdapter (extensible with 3 customization levels)
  - ✅ CachedAdapter (offline-first with cache strategies)
  - ✅ SyncAdapter (bidirectional sync with conflict resolution)
- ✅ **Fields:**
  - ✅ Basic fields (CharField, IntegerField, FloatField, BooleanField, DateTimeField, DateField, JSONField, ChoiceField)
  - ✅ Relationship fields (ForeignKeyField, OneToOneField)
- ✅ **Queries:**
  - ✅ Basic queries (filter, order_by, limit, offset, first, last, count, exists)
  - ✅ Advanced queries (select_related, prefetch_related)
  - ✅ Field lookups (18 types: __gt, __gte, __lt, __lte, __contains, __icontains, __startswith, __istartswith, __endswith, __iendswith, __exact, __iexact, __in, __range, __isnull, __year, __month, __day)
- ✅ **Features:**
  - ✅ Field validation
  - ✅ Signal system (pre_init, post_init, pre_save, post_save, pre_delete, post_delete)
  - ✅ CRUD operations (create, update, delete, getOrCreate, updateOrCreate)
  - ✅ Offline-first capabilities
  - ✅ TypeScript strict mode
  - ✅ Comprehensive documentation

### v0.3.0 (Planned - Beta Release)
- Q objects (OR, AND, NOT)
- Aggregation (Count, Sum, Avg, Min, Max)
- Grouping (group_by, annotate)
- values() and values_list()
- Advanced field types (ArrayField, EnumField, UUIDField)
- Additional adapters (LocalStorage, Dexie, REST)

### v1.0.0 (Planned - Production Release)
- Production ready
- Multiple adapters (GraphQL, REST, SQL)
- Complete feature set

## Timeline Overview

```
Month 1-2:  Phase 1-2 (Core + Memory Adapter)
Month 2-3:  Phase 3 (Relationships)
Month 3:    Phase 4 (Signals)
Month 3-4:  Phase 5 (Sync)
Month 4-5:  Phase 6 (Advanced)
Month 5-6:  Phase 7 (Production)
```

**Estimated total time to v1.0.0: 5-6 months of full-time development**

With part-time development or community contributions, timeline may vary.

## Success Metrics

### Technical
- [ ] <50kb bundle size (core)
- [x] Fast query execution (MemoryAdapter is instant)
- [x] Zero known critical bugs
- [x] TypeScript strict mode enabled

### Community
- [ ] 1000+ GitHub stars
- [ ] 10+ adapters available - **Currently: 4 (Memory, GraphQL, Cached, Sync)**
- [ ] 50+ contributors
- [ ] Active community

### Adoption
- [ ] Used in 100+ production apps
- [ ] Featured in dev blogs/tutorials
- [ ] Framework integrations available

## License

MIT - Open source and free to use.
