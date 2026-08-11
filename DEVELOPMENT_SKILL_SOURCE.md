# Technical Specification for Adaptive Weekly Planner Products

Версия: draft 1.0  
Назначение: исходник для будущего Codex skill, который помогает разрабатывать
новые продукты класса adaptive weekly planner.

Этот документ не является handoff для продолжения одного конкретного планировщика.
Он обобщает предоставленную техническую спецификацию Cadence и практический опыт
двух волн разработки реального weekly planner продукта: первичной сборки и
последующего hardening. Его задача — дать reusable техническое задание,
по которому можно проектировать, реализовывать, проверять и развивать похожие
продукты.

Документ не должен содержать hard-coded расписание конкретного человека,
конкретный сервер, IP, бренд, репозиторий или локальные пути. Такие детали
должны жить в project-specific handoff, memory или README конкретного проекта.

## 1. Product Definition

### 1.1 Что это за класс продуктов

Adaptive weekly planner — это web/mobile-first продукт для сборки недели из:

- фиксированных повторяющихся событий;
- плавающих недельных норм или quota categories;
- разовых задач из свободного текста;
- вручную размещаемых блоков времени;
- исключений вроде выходного, отъезда, болезни, закрытого дня;
- понятных подсказок, которые не расходятся с реальными правилами записи;
- обратимых пользовательских действий.

Это не универсальный календарь, не task tracker и не project-management система.
Ценность продукта в том, чтобы быстро и без лишних форм помочь пользователю
разложить одну неделю так, чтобы она была реалистичной, редактируемой и
восстанавливаемой после ошибки.

### 1.2 Типовой пользовательский контекст

Пользователь может быть не техническим. Он часто планирует:

- с телефона;
- на ходу;
- между другими делами;
- короткими естественными фразами;
- без желания заполнять много полей;
- с ожиданием, что ошибку можно отменить.

Типовой ввод:

```text
dentist Tuesday 15:00
studio Friday 4 hours
call from 13:00 to 14:30
away from Monday for 5 days
```

Для локализованных продуктов parser должен учитывать язык пользователя:
падежи, сокращения дней недели, форматы времени, привычные слова длительности.

### 1.3 Non-goals для базовой версии

В MVP не включать без отдельного требования:

- приглашения участников;
- внешний календарный sync;
- сложные recurrence rules уровня RRULE;
- совместное редактирование в реальном времени;
- AI-автопланирование без ручного подтверждения;
- billing;
- multi-tenant admin;
- сложную notification platform;
- сложную историю версий.

Эти направления можно развивать позже, но они не должны ломать базовую
эргономику недельного планирования.

## 2. Product Principles

### 2.1 Guardrails, not gatekeeping

Система должна запрещать только действия, которые действительно создают
некорректное состояние:

- пересечение блоков;
- постановку блока в закрытый день;
- нарушение правила quota category;
- невозможность закончить quota block до cutoff;
- действие, которое backend всё равно отклонит.

Но она не должна блокировать законные исключения. Например, обычная разовая
задача может быть поздней, если она помещается в сетку, даже если quota block
того же размера уже не должен начинаться так поздно.

### 2.2 Suggestions are promises

Любая подсказка вида “сюда можно поставить блок” является обещанием. Если
интерфейс показывает свободное окно, backend должен принять соответствующее
действие.

Недопустимые расхождения:

- UI считает окно подходящим по raw duration, а server rejects из-за cutoff;
- drag preview разрешает позицию, а PATCH отклоняет её;
- mobile list предлагает действие, которое desktop grid или API не разрешает;
- quick add выбирает слот, который затем падает с ошибкой.

Правило: suggestion logic должна использовать тот же predicate, что и write
logic, или строго эквивалентную реализацию.

### 2.3 Every mutation needs a return path

Каждое пользовательское изменение должно иметь обратный ход:

- undo toast;
- явная противоположная кнопка;
- восстановление из snapshot;
- повторная сборка batch flow;
- read-only nature for exports/screenshots.

Undo не является polish. Для planner products это часть доверия: пользователь
двигает неделю руками и должен знать, что может вернуть ошибку назад.

### 2.4 Mobile is a first-class surface

Mobile UI не должен быть просто уменьшенной desktop grid. Для телефона нужны:

- week list as primary surface;
- day detail view;
- bottom sheets;
- finger-sized controls;
- explicit drag handles;
- safe native scroll;
- visible controls without hover;
- undo visible without keyboard shortcuts.

### 2.5 Configuration must become product language

Жёстко заданные значения вроде working hours, quota counts, min duration,
latest-end cutoff и recurring events быстро становятся продуктовым языком.
В single-user MVP они могут быть config constants. В reusable/SaaS продукте они
должны стать workspace settings.

## 3. Development Journey

Будущий skill должен вести похожий продукт по этим этапам. Если пользователь
просит точечную правку, skill может перейти к нужному этапу, но должен понимать,
какой слой продукта затрагивает изменение.

### Stage 0 — Frame the product

Цель: понять, какой planner строится.

Вопросы:

- Кто планирует неделю?
- Это single-user, family/household, small team или SaaS?
- Что в неделе фиксировано?
- Что плавает и должно быть размещено вручную?
- Какие действия должны быть быстрыми на телефоне?
- Какие интеграции специально не нужны?

Deliverables:

- product intent;
- target user;
- non-goals;
- primary workflows;
- first success criteria.

### Stage 1 — Define the domain model

Цель: определить сущности до UI.

Минимальные сущности:

- block;
- template;
- inbox task;
- quota category;
- recurring event;
- day state;
- away/unavailability period;
- week seed/materialization marker.

Если продукт multi-user:

- user;
- workspace;
- membership;
- role;
- workspace settings.

Deliverables:

- entity list;
- field list;
- relationships;
- generated vs user-owned data decisions;
- tenancy boundary decision.

### Stage 2 — Define rules and invariants

Цель: правила должны существовать до drag/drop и wizard.

Определить:

- day start/end;
- slot size;
- min block duration;
- overlap rule;
- quota count;
- quota min duration;
- quota latest-end cutoff;
- same-category-per-day rule;
- day-off behavior;
- away side effects;
- recurring seed behavior.

Deliverables:

- validation predicates;
- edge cases;
- client/server responsibility split;
- examples of allowed and rejected actions.

### Stage 3 — Map proactive and reverse actions

Цель: до реализации mutations определить undo/recovery.

Deliverables:

- proactive action matrix;
- reverse action matrix;
- required snapshots;
- batch undo strategy;
- user feedback model.

Использовать таблицы из §5 как обязательный checklist.

### Stage 4 — Choose MVP architecture

Single-user MVP can use:

- monolithic web app;
- local or file DB;
- API routes in same app;
- token auth;
- manual deploy;
- export as backup.

Reusable/SaaS product should start with:

- user/workspace;
- managed DB;
- workspace settings;
- real auth;
- migrations;
- CI/CD path.

Deliverables:

- stack decision;
- API route map;
- DB choice;
- auth choice;
- deployment choice.

### Stage 5 — Build the core week loop

Build:

- week loading;
- block rendering;
- create/edit/delete block;
- move block;
- resize block;
- overlap validation;
- day bounds;
- basic undo.

Do not start with complex AI planning. Build the manual week loop first.

Deliverables:

- usable weekly surface;
- basic API writes;
- validation on client and server;
- smoke-tested mutation flow.

### Stage 6 — Add recurring materialization

Build:

- recurring definitions;
- week materialization;
- week seed marker;
- deletion of one instance without regenerating it;
- optional recurring review in wizard.

Key invariant: generated recurring blocks become user-editable week data.
Do not regenerate deleted recurring blocks just because the week reloads.

Deliverables:

- idempotent week seed;
- recurring block snapshots;
- deletion semantics.

### Stage 7 — Add quota categories

Build:

- quota settings;
- outstanding quota tray;
- quota block placement;
- same-category-per-day rule;
- min duration;
- optional latest-end cutoff;
- progress indicator;
- optional extra quota blocks after required count.

Deliverables:

- quota progress;
- valid suggestions;
- write-path enforcement.

### Stage 8 — Add mobile-first surface

Build:

- week list as primary mobile view;
- day view;
- optional compact grid;
- bottom sheet quick-add;
- explicit drag handles;
- visible day controls;
- safe scroll/drag separation;
- mobile undo toast.

Deliverables:

- mobile viewport verification;
- no hover-only critical controls;
- no accidental drag from scroll surface.

### Stage 9 — Add guided assembly

Build:

- wizard shell;
- review recurring events;
- add one-off items in free text;
- parse day/time/duration;
- place parseable items in one action;
- leave unparsed or rejected items with reasons;
- batch undo.

Deliverables:

- guided week assembly;
- parser examples;
- unparsed item feedback;
- undo for batch placement.

### Stage 10 — Add modes and exceptions

Build:

- day off;
- away/unavailability period;
- return/cancel flow;
- range side effects;
- snapshot before destructive range mutations.

Deliverables:

- day-state API;
- away API;
- restoration behavior;
- clear confirmation if restore is impossible.

### Stage 11 — Add library, reporting, and sharing

Build:

- template library;
- template editor;
- stats;
- export/backup;
- print/share/screenshot view.

Deliverables:

- reusable block defaults;
- read-only analytics;
- share artifact;
- backup artifact.

### Stage 12 — Harden from real use

Run hardening after actual feedback:

- compare suggestions against writes;
- test exact window boundaries;
- test mobile touch controls;
- test undo after every mutation;
- test cancellation paths;
- remove unreliable integrations;
- update docs and changelog.

Deliverables:

- bug fixes;
- edge-case coverage;
- updated product specification.

### Stage 13 — Operate and deploy

Single-server deploy:

- copy source without secrets/build artifacts;
- build on server;
- restart service;
- verify service health;
- verify public HTTP;
- verify changed files/routes.

When mobile home-screen installation is required:

- provide a web app manifest and platform-sized icons;
- use standalone metadata and a stable HTTPS origin;
- verify the generated manifest and metadata from the production build;
- provide exact installation instructions for the target platform;
- do not claim offline support unless mutations have a synchronization and
  conflict strategy.

SaaS deploy:

- CI build;
- migrations;
- immutable artifacts;
- monitoring;
- rollback;
- backups.

Deliverables:

- deploy checklist;
- health check;
- rollback/backup notes.

### Stage 14 — Convert to reusable skill or product template

When converting this spec into a Codex skill:

- keep this document generic;
- put customer-specific facts in separate handoff/memory;
- include stage checklist;
- include action/reverse matrix;
- include mobile hardening rules;
- include validation consistency rule;
- include deployment verification rule.

## 4. Domain Model

### 4.1 Block

A placed time-boxed entry on a date.

Fields:

- `id`
- `title`
- `date`
- `start`
- `duration`
- `color`
- `done`
- `recurring`
- `categoryId` or `kind`
- `templateId`
- `source`
- `createdAt`
- `updatedAt`

Model `start` and `duration` as minutes from midnight, not timestamps. The date
selects the day; the integers select layout inside the day. This avoids mixing
timezone logic with vertical layout.

### 4.2 Template

A reusable block definition.

Fields:

- `id`
- `name`
- `defaultColor`
- `defaultDuration`
- `categoryId`
- `recurDay`
- `recurStart`
- `order`

Templates can power:

- quick-add library;
- recurring event definitions;
- onboarding defaults;
- tenant/workspace settings.

### 4.3 Inbox Task

An unplaced item captured quickly.

Fields:

- `id`
- `title`
- `duration`
- `preferredDate`
- `preferredStart`
- `order`
- `done`
- `placedBlockId`

If a task becomes a block, choose a clear model:

- delete task and create block;
- mark task as placed;
- keep link between task and block.

Whichever model is chosen, undo must be explicit.

### 4.4 Quota Category

A weekly required category that floats in time.

Fields:

- `id`
- `label`
- `icon`
- `requiredCount`
- `minimumDuration`
- `latestEnd`
- `allowMultiplePerDay`
- `color`
- `order`

The category is placed by the user. The system can guide, suggest, validate,
and show progress, but should not silently auto-place unless the product
explicitly includes automatic planning.

### 4.5 Day State

A date-specific state.

Fields:

- `date`
- `state`
- `label`
- `source`

Examples:

- working;
- day off;
- unavailable;
- travel;
- sick;
- holiday.

MVP can use boolean `dayOff`. Reusable products should prefer an enum.

### 4.6 Away / Unavailability Period

A date range that applies day states and optional marker blocks.

Fields:

- `id`
- `startDate`
- `endDate`
- `label`
- `source`

If enabling a range removes or changes existing blocks, capture snapshots before
mutation.

### 4.7 Week Seed

Marker that recurring events were materialized for a week.

Fields:

- `weekStart`
- `seededAt`
- `seedVersion`

This prevents recurring blocks from reappearing after the user deletes a
materialized instance.

## 5. Proactive and Reverse Actions

### 5.1 Proactive actions

| Area | Proactive action | User intent |
|---|---|---|
| Week | Open week | See current planning state |
| Week | Change week | Inspect another week |
| Week | Assemble week | Use guided flow to build a plan |
| Week | Reassemble week | Repair or rerun guided planning |
| Block | Create block | Put a commitment into time |
| Block | Edit title/color/day/time/duration | Correct a planned item |
| Block | Move block | Put an item in a better slot |
| Block | Resize block | Adjust expected effort |
| Block | Swap two blocks | Exchange positions without manual repair |
| Block | Delete block | Remove no-longer-needed item |
| Block | Toggle done | Track completion |
| Inbox | Add task | Capture unplaced work |
| Inbox | Delete task | Remove captured work |
| Inbox | Convert task to block | Schedule captured work |
| Parser | Parse free text | Extract day, time, duration, title |
| Template | Create template | Add reusable default |
| Template | Edit template | Change reusable default |
| Template | Delete template | Remove obsolete default |
| Quota | Place required quota block | Satisfy weekly category requirement |
| Quota | Place optional extra quota block | Add more than required |
| Recurring | Remove recurring instance | Cancel one occurrence |
| Day state | Set day off | Close a day |
| Day state | Unset day off | Reopen a day |
| Away | Start away period | Close a date range |
| Away | Cancel/return from away | Reopen range |
| Library | Reorder templates | Change quick-add priority |
| Stats | View stats | Understand completion |
| Export | Export data | Backup or handoff |
| Share | Generate screenshot/share view | Send plan externally |
| Settings | Change quota/settings | Adapt product to workspace/user |

### 5.2 Reverse actions

| Proactive action | Reverse action | Required support |
|---|---|---|
| Open week | Return to previous week | Previous navigation state |
| Change week | Go back / Today | Week navigation state |
| Assemble week | Undo batch or safely reassemble | Batch snapshot |
| Reassemble week | Undo batch or rerun idempotently | Idempotent operations |
| Create block | Delete created block | Created block ID |
| Edit block | Restore previous fields | Snapshot before save |
| Move block | Restore previous date/start | Previous placement |
| Resize block | Restore previous duration | Previous duration |
| Swap two blocks | Swap same pair again | Atomic command |
| Delete block | Recreate block | Full block snapshot |
| Toggle done | Restore previous done value | Previous boolean |
| Add task | Delete task | Created task ID |
| Delete task | Recreate task | Task snapshot |
| Convert task to block | Delete block and restore task | Source task snapshot |
| Parse free text | Keep original text editable | Original input |
| Create template | Delete template | Created template ID |
| Edit template | Restore previous fields | Template snapshot |
| Delete template | Recreate template | Template snapshot |
| Place required quota block | Delete placed block | Created block ID/category |
| Place optional extra quota block | Delete placed block | Created block ID/category |
| Remove recurring instance | Recreate instance | Materialized block snapshot |
| Set day off | Restore previous day state | Week day-state snapshot |
| Unset day off | Restore previous day state | Week day-state snapshot |
| Start away period | Remove period and restore range | Blocks/day states snapshot |
| Cancel/return from away | Recreate away if needed | Away period snapshot |
| Reorder templates | Restore previous order | Order snapshot |
| View stats | No mutation | Read-only |
| Export data | No mutation | Read-only |
| Generate screenshot/share view | No mutation | Read-only |
| Change settings | Restore previous settings | Settings snapshot |

### 5.3 Action design checklist

Before implementing any new mutation, answer:

1. Which entities change?
2. Which validation rules can reject it?
3. What previous state must be snapshotted?
4. What exact inverse action restores the state?
5. Is the action single-entity or batch?
6. Can the inverse run safely after partial failure?
7. What does the user see after success?
8. What does the user see after failure?

If a reverse action cannot be cleanly defined, the product must either:

- ask for explicit confirmation;
- store server-side command history;
- make the action non-destructive;
- change the data model.

## 6. Business Rules and Validation

### 6.1 Placement rules

Every create/move/resize/edit path should enforce:

- title required;
- valid date;
- valid start;
- valid duration;
- snap to slot size;
- fit within day bounds;
- no overlap with existing block on the same day;
- no block in closed day state;
- category-specific restrictions.

### 6.2 Quota rules

Quota category can define:

- required count per week;
- minimum duration;
- latest end;
- maximum instances per day;
- whether optional extra instances are allowed;
- whether extra instances count in stats.

If a quota category has `latestEnd`, validation should check finish time:

```text
start + duration <= latestEnd
```

Suggestion logic should check that there exists a valid start within the window,
not just that the window is long enough.

### 6.3 Day state rules

Day state can:

- block all new blocks;
- visually mark the day;
- remove or hide suggestions;
- affect quota counting;
- be limited per week;
- be set by direct user action or range mode.

If only one day off per week is allowed, backend must reject a second active
day off. Client should explain how to switch days.

### 6.4 Recurring rules

Recurring events are definitions. Concrete week blocks are materialized.

Rules:

- seed only once per week;
- store seed marker;
- materialized block can be edited/deleted;
- deleted materialized block should not reappear on reload;
- config changes should require seed versioning or explicit migration.

### 6.5 Client and server consistency

Client validation gives fast feedback. Server validation is authoritative.

Required:

- no looser UI suggestions than backend writes;
- same overlap logic;
- same day-off logic;
- same quota logic;
- API errors phrased for users.

## 7. Free-text Parsing

### 7.1 Purpose

The parser converts natural task text into structured placement hints:

- day;
- start;
- duration;
- title.

Examples:

```text
doctor Tuesday 15:00
studio Friday 4 hours
call 13:00-14:30
meeting from 13 to 15
```

### 7.2 Parse order

Recommended order:

1. Time range.
2. Explicit duration.
3. Day of week.
4. Start time.
5. Title cleanup.

Reason:

- range gives start and duration together;
- duration must be removed before bare-hour parsing;
- day parsing may include locale-specific inflections;
- title should preserve meaningful residue.

### 7.3 Parser behavior

Parser should:

- return partial result rather than throw;
- leave unparsed item in inbox/wizard;
- explain missing day/time/conflict;
- default duration when missing;
- reject impossible duration ranges;
- avoid ambiguous number parsing.

### 7.4 Parser test cases

Для продуктов, где «весь день» означает крупный плановый блок, parser должен
понимать локализованные эквиваленты (`весь день`, `на весь день`, `целый день`),
преобразовывать их в продуктовый all-day preset и удалять служебную фразу из
названия. Явная длительность или диапазон времени имеет приоритет над preset.
Результат остаётся обычным редактируемым блоком: пользователь может поменять
начало и длительность.

Include tests for:

- colon time;
- dot time;
- bare hour if supported;
- dash range;
- “from X to Y” range;
- minutes duration;
- hours duration;
- decimal hours;
- day abbreviations;
- inflected day names;
- title cleanup;
- ambiguous numbers.

## 8. Undo Architecture

### 8.1 Client-held undo stack

Good for single-user products.

Undo item:

- message;
- inverse async action;
- affected entity IDs;
- snapshots;
- optional expiry;
- optional max stack size.

UI:

- bottom toast;
- button label like `Undo`;
- close action;
- success feedback;
- error fallback and refresh.

### 8.2 Server-backed undo

Use when:

- multiple users edit;
- undo must survive reload;
- operations are complex;
- audit matters;
- offline clients replay mutations.

Pattern:

- command table;
- event log;
- revision IDs;
- idempotency keys;
- restore command.

### 8.3 Batch undo

For wizard/away/reassemble:

- snapshot all affected blocks;
- snapshot all affected tasks;
- snapshot day states;
- store created IDs;
- restore in a safe order;
- refresh after partial failure.

### 8.4 Atomic commands

If a valid user operation has invalid intermediate states, create a dedicated
server command.

Example:

```text
POST /api/blocks/swap
```

Two sequential PATCH requests can temporarily violate overlap rules. Atomic
swap validates final state and updates both records transactionally.

## 9. Mobile Interaction Specification

### 9.1 Primary mobile views

Required:

- week list;
- day view;
- quick-add bottom sheet;
- visible undo;
- clear block edit flow.

Optional:

- compact grid;
- scrollable grid;
- agenda gaps;
- mode switcher.

### 9.2 Drag and scroll separation

Rules:

- block body is for tap/edit and normal scroll;
- drag starts from explicit handle;
- handle target is finger-sized;
- resize handle is large enough if mobile resize is supported;
- no hover-only drag affordances;
- touch-action matches role.

### 9.3 Touch cancellation

Clear drag state on:

- `pointerup`;
- `touchend`;
- `pointercancel`;
- `blur`;
- `visibilitychange`;
- lost pointer capture.

В iOS/Telegram WebView одного `touch-action: none` и `overscroll-behavior`
может быть недостаточно. Пока активен drag с явной ручки, приложение должно
установить non-passive `touchmove` listener, вызвать `preventDefault()` и снять
listener на каждом пути завершения (`pointerup`, `touchend`, `pointercancel`,
`touchcancel`, blur, visibility change). Программный автоскролл целевого
контейнера должен остаться доступным.

Clear:

- preview;
- overlay;
- active pointer;
- auto-scroll timers;
- snap state.

### 9.4 Overscroll and auto-scroll

For iOS and mobile webviews:

- use `overscroll-behavior` where supported;
- contain scrollable areas;
- prevent full-page rubber-band where it reads as broken drag;
- implement auto-scroll near edge for every scrollable drag surface, not only the easiest one.

### 9.5 Mobile numeric input

Controlled numeric inputs should allow blank editing state.

Bad pattern:

```text
onChange -> Number(value) || 1
```

This prevents deleting the first digit on mobile keyboards.

Good pattern:

- store text while editing;
- allow `""`;
- restrict characters if needed;
- validate on submit;
- derive domain number only when valid.

## 10. API Specification

Suggested API:

```text
GET    /api/week
POST   /api/blocks
PATCH  /api/blocks/:id
DELETE /api/blocks/:id
POST   /api/blocks/swap
POST   /api/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
POST   /api/templates
PATCH  /api/templates/:id
DELETE /api/templates/:id
POST   /api/day-state
POST   /api/away
DELETE /api/away/:id
GET    /api/stats
GET    /api/export
GET    /api/screenshot
POST   /api/login
```

Route rules:

- all mutating routes validate server-side;
- all protected routes pass auth/tenant guard;
- write routes return user-safe errors;
- read-only routes must not mutate data;
- batch routes should be transactional where possible.

## 11. Data and Persistence

### 11.1 Single-user MVP

Acceptable:

- SQLite;
- Prisma or similar ORM;
- one app process;
- token auth;
- JSON export backup;
- manual VPS deployment.

### 11.2 Reusable or SaaS product

Needed:

- `User`;
- `Workspace`;
- `Membership`;
- `WorkspaceSettings`;
- tenant-scoped tables;
- real auth;
- managed DB;
- migrations;
- backups;
- observability;
- billing if commercial;
- server-side history if collaborative.

### 11.3 Settings

Settings should include:

- day bounds;
- slot size;
- quota categories;
- quota counts;
- minimum durations;
- cutoff times;
- recurring definitions;
- locale parser options;
- colors/icons;
- allowed day states;
- screenshot/export options.

## 12. UI Surfaces

### 12.1 Week surface

Must show:

- days;
- blocks;
- current week title;
- navigation;
- quota progress;
- day states;
- undo toast;
- create action.

### 12.2 Mobile week list

Must show:

- day name/date;
- day-state label;
- blocks sorted by time;
- free windows if useful;
- quick-add;
- visible day-state toggle;
- move handle.

### 12.3 Block editor

Must allow:

- title;
- day;
- start time;
- duration;
- color/category;
- delete;
- cancel/save.

### 12.4 Week wizard

Should include:

- review generated recurring events;
- add one-off items as list;
- parse/place all;
- show unparsed/rejected items;
- finish/reopen/reassemble;
- undo batch.

### 12.5 Template editor

Should allow:

- create template;
- rename;
- color;
- duration;
- category;
- delete;
- undo changes.

### 12.6 Reporting and sharing

Can include:

- monthly stats;
- quota completion;
- planned hours;
- completed blocks;
- export JSON;
- screenshot/print view.

## 13. Testing and Verification

### 13.1 Required checks

Before handoff:

- lint;
- typecheck/build;
- API route list if routes changed;
- smoke test main page;
- mobile viewport check for UI changes;
- targeted parser/rule checks when changed.

### 13.2 Rule tests

Cover:

- overlap;
- exact boundary fit;
- day-off rejection;
- same category per day;
- latest-end cutoff;
- raw gap vs feasible start;
- swap validity;
- recurring seed idempotency;
- away range restore;
- batch undo.

### 13.3 Parser tests

Cover:

- time ranges;
- duration words;
- decimal hours;
- ambiguous numbers;
- localized weekdays;
- title cleanup;
- default duration.

### 13.4 Mobile QA

Verify:

- no text overlap;
- controls visible without hover;
- drag handles large enough;
- normal scroll does not start drag;
- drag does not rubber-band the page;
- previews clear after cancel;
- quick-add does not choose invalid slots.

## 14. Operations

### 14.1 Single VPS deployment

Deployment steps:

1. Sync source without secrets/build artifacts.
2. Build on server.
3. Run migrations if needed.
4. Restart service.
5. Verify service active.
6. Verify public HTTP.
7. Verify changed files/routes exist.
8. For installable web apps, verify HTTPS, manifest, icons and standalone launch.

Do not deploy:

- `.env`;
- `.git`;
- local build output;
- `node_modules`;
- local dev database unless intentionally migrating.

### 14.2 Production maturity

Add as product grows:

- CI/CD;
- immutable builds;
- migrations;
- rollback;
- backups;
- structured logs;
- error tracking;
- uptime monitoring;
- usage metrics.

## 15. SaaS Transformation Path

The domain model can become multi-tenant, but only after explicit changes:

1. Add user/workspace boundary.
2. Scope every table by workspace.
3. Move config into workspace settings.
4. Replace token auth with real identity.
5. Move from local SQLite to managed DB or tenant-isolated storage.
6. Add onboarding for quotas, recurring events, working hours.
7. Add billing at workspace level.
8. Add notification preferences.
9. Add observability and CI/CD.
10. Promote mobile primitives into reusable components.
11. Consider server-backed undo/event history.
12. Define collaboration conflict handling.

## 16. Empirical Basis From Two Development Waves

This document is based on:

- a provided anonymized Cadence specification covering product shape, domain
  model, architecture, validation, mobile patterns, operations, and SaaS path;
- an initial implementation wave by another agent;
- a follow-up hardening wave by the current agent.

The original product identity is not part of this spec. The reusable lessons are.

### 16.1 Initial implementation wave lessons

#### Complete single-user loop beats broad calendar scope

The first useful product did not need sync, accounts, collaboration, or billing.
It needed a complete loop:

- load week;
- create blocks;
- edit blocks;
- drag/resize;
- seed recurring items;
- use inbox;
- enforce rules;
- persist data;
- deploy.

#### Mobile agenda is not optional

The mobile list/agenda became more usable than a compressed grid. Similar
products should treat mobile list as a primary surface.

#### Wizard should reduce ceremony

The week assembly flow became effective when one-off tasks could be entered as
a free list and placed with one button. Per-item forms were too heavy.

#### Generated recurring data needs seed markers

Recurring event generation must not resurrect user-deleted instances on reload.

#### Soft copy matters

Planner products are emotionally close to the user's real life. Error and helper
copy should be clear, calm, and specific.

#### In-app notices can be more reliable than external bots

A separate bot/notification worker can add operational fragility. Start with
reliable in-app notices unless external notifications are a core requirement.

### 16.2 Hardening wave lessons

#### Undo must be designed across all mutations

Hardening added undo for blocks, tasks, templates, day states, away ranges and
wizard batches. This changed the product from “editable” to “recoverable”.

#### Atomic swap belongs on the server

Swapping blocks can be a valid final state but invalid as two sequential updates.
Dedicated command routes solve this cleanly.

#### Mobile number fields need editable text state

Coercing empty numeric input to a default prevents deletion on iPhone keyboards.
Allow blank edit state and validate on confirm.

#### Parser duration support changes placement behavior

Adding `2 hours`, `1.5 h`, `90 min`, and time ranges requires careful parse
order. Otherwise duration and time grammars collide.

#### Latest-end cutoff affects suggestions

After adding cutoff rules, mobile free-window suggestions had to check feasible
starts, not raw gap length. A suggestion is a promise.

#### Touch bugs are role bugs

Accidental page dragging came from mixing scroll surfaces and drag surfaces.
The fix was explicit handles, larger touch targets, touch-action by role,
overscroll containment, and cleanup on every cancel path.

#### Hover-only controls fail on phones

Controls hidden until hover were invisible on touch devices. Important controls
must be visible or otherwise discoverable.

#### Changelog became product memory

Grouped changelog entries captured the evolution of product rules and UX fixes.
That history is useful input for reusable skill creation.

## 17. Skill Behavior Requirements

A future Codex skill based on this document should:

- help develop new similar products, not continue the original planner;
- start by identifying which stage the request belongs to;
- inspect the target project's existing patterns before changing code;
- preserve validation consistency between client and server;
- require proactive/reverse action mapping for mutations;
- protect mobile drag/scroll separation;
- update docs/changelog for user-visible behavior;
- run lint/build/tests appropriate to the target project;
- deploy only when explicitly requested;
- report verification and known gaps.

The skill should not:

- hard-code a specific user's schedule;
- assume a specific repository or server;
- assume single-tenant if the target product is SaaS;
- introduce calendar-sync complexity into MVP without user request;
- loosen backend validation to satisfy a UI shortcut;
- ship mobile hover-only controls;
- add irreversible destructive actions without confirmation or undo.

## 18. Final Implementation Checklist

Use this checklist before finishing any similar product task:

- Product stage identified.
- Domain entity impacted.
- Proactive action named.
- Reverse action defined.
- Snapshot requirements clear.
- Client validation updated.
- Server validation updated.
- Suggestions match writes.
- Mobile behavior checked if UI changed.
- Parser examples updated if parsing changed.
- Batch operations restorable.
- Recurring generation remains idempotent.
- Away/day-state side effects clear.
- Docs/changelog updated.
- Lint/build passed.
- Deploy verified if deploy was requested.
