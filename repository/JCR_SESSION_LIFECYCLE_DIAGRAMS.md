# JCR Session Lifecycle - Visual Diagrams

## Sequence Diagram: Complete Job Execution Workflow

```
Job Engine                Factory                Template            Cache
    |                       |                       |                  |
    | Job starts            |                       |                  |
    |----request session--->|                       |                  |
    |                       | lookup cache          |                  |
    |                       |                  +----+----+             |
    |                       |                  | Session |             |
    |                       |                  +----+----+             |
    |                       | RefCount=1            |                  |
    |                       |    +increment+        |                  |
    |<--return session------+                       |                  |
    |                       |                       |                  |
    | execute(action)       |                       |                  |
    |-------------------ref session---------->|    |                  |
    |                       |                  |    |                  |
    |                       |                  | RefCount=2           |
    |                       |                  |    +increment+        |
    |                       |                  |    |                  |
    |                       |      action.doInJcr() |                  |
    |                       |      (Job Logic)      |                  |
    |                       |                  |    |                  |
    |                       |        finally        |                  |
    |                       |                  |    |                  |
    |                       |                  | RefCount=1           |
    |                       |                  |    +decrement+        |
    |                       |                  |                       |
    |                       |      factory  |                  |
    |                       |      release  |                  |
    |                       | RefCount=0    |                  |
    |                       |    +decrement+ |                  |
    |                       |                |    return to cache
    |                       |                |                  |
    |<--return result-------+<--------+------+<--------+--------|
    |                       |                       |                  |
    v                       v                       v                  v
```

## State Diagram: Reference Count State Machine

```
                        START: RefCount=0
                            |
                            v
        ┌─────────────────────────────────────┐
        |   Factory.getSession()              |
        |   RefCount: 0 → 1                   |
        |   [JCR-FACTORY-RETRIEVE]            |
        │   State: FACTORY_PROTECTED          |
        └─────────────────────────────────────┘
                            |
                            v
        ┌─────────────────────────────────────┐
        |   Template.useSession()             |
        |   RefCount: 1 → 2                   |
        |   [JCR-TEMPLATE-USE]                |
        |   State: IN_USE_BY_TEMPLATE         |
        └─────────────────────────────────────┘
                            |
                   ┌────────┴────────┐
                   v                 v
              SUCCESS           EXCEPTION
              Job OK!           Error!
                   |                 |
                   └────────┬────────┘
                            v
        ┌─────────────────────────────────────┐
        |   Template.releaseSession()         |
        |   RefCount: 2 → 1                   |
        |   [JCR-TEMPLATE-RELEASE]            |
        |   State: FACTORY_PROTECTED (again)  |
        └─────────────────────────────────────┘
                            |
                            v
        ┌─────────────────────────────────────┐
        |   Factory.decrementProtection()     |
        |   RefCount: 1 → 0                   |
        |   [JCR-FACTORY-RELEASE]             |
        |   State: IDLE_IN_CACHE              |
        └─────────────────────────────────────┘
                            |
                   ┌────────┴────────┐
                   v                 v
            SCENARIO A          SCENARIO B
         Next Job Starts  Timeout/Eviction
            (Reuse)          (Cleanup)
                   |                 |
                   |                 v
              Factory Get     Removal Listener
              RefCount 0→1    session.logout()
                   |                 |
                   └────────┬────────┘
                            v
                        END: Session
                         Idle/Dead
```

## Timeline: Parallel Jobs with Thread Isolation

```
Timeline (seconds)
0s          1s          2s          3s          4s          5s
|-----------|-----------|-----------|-----------|-----------|
│
Job 1 (admin, pool-1)
│  [RETRIEVE] RefCount=1
│  ├─ [USE] RefCount=2
│  ├─ [EXECUTE] (job logic)
│  ├─ [RELEASE] RefCount=1
│  └─ [FACTORY-RELEASE] RefCount=0
│     Session A cached
│                    
│                    Job 2 (admin, pool-2)
│                    [RETRIEVE] RefCount=1 (NEW SESSION)
│                    ├─ [USE] RefCount=2
│                    ├─ [EXECUTE] (job logic)
│                    ├─ [RELEASE] RefCount=1
│                    └─ [FACTORY-RELEASE] RefCount=0
│                       Session B cached
│
│                                  Job 3 (admin, pool-1)
│                                  [RETRIEVE] RefCount=1 (REUSE SESSION A)
│                                  ├─ [USE] RefCount=2
│                                  ├─ [EXECUTE] (job logic)
│                                  ├─ [RELEASE] RefCount=1
│                                  └─ [FACTORY-RELEASE] RefCount=0
│                                     Session A cached (again)
│
│                                                 Job 2 Cache Timeout
│                                                 (300s elapsed)
│                                                 [EVICT] Session B
│                                                 session.logout()
│                                                 SAFE: RefCount=0
```

## Cache Eviction Decision Tree

```
                    Cache Eviction Triggered
                            |
                            v
                ┌───────────────────────────┐
                │  Check RefCount Value     │
                └───────────┬───────────────┘
                            |
                ┌───────────┴───────────┐
                |                       |
                v                       v
            RefCount=0              RefCount>0
            (Safe)                  (In Use)
                |                       |
                v                       v
         ┌─────────────┐         ┌──────────────┐
         │ LOG OUT     │         │ WARN LOG     │
         │ session     │         │ "Session may │
         │             │         │ be orphaned" │
         │ CLEANUP     │         │              │
         │ COMPLETE    │         │ KEEP alive   │
         └─────────────┘         └──────────────┘
                |                       |
                v                       v
           Session        Wait for RefCount
           Terminated     to reach 0
```

## Reference Counting Visualization

### Healthy Workflow

```
Reference Count Changes Through Job Lifecycle

RefCount
   2 ┤                    ╭─────╮
     │                    │     │
   1 ├    ╭──────────╮    │     │    ╭──────────╮
     │    │          │    │     │    │          │
   0 ├────┴──────────┴────┴─────┴────┴──────────┴────
     │
     └──────┬─────────┬─────────┬──────────┬─────────
            │         │         │          │
        [RETRIEVE]  [USE]   [RELEASE] [FACTORY-REL]
        
     Jobs:     Job 1                    Ready for Job 2
     
     Status:   PROTECTED   IN_USE   PROTECTED   IDLE
```

### Imbalanced/Buggy Workflow (BAD)

```
Reference Count Changes - WITH BUG (No Factory Increment)

RefCount
   2 ┤
     │
   1 ┤    ╭───────╮
     │    │       │
   0 ├────┴───────┴────────────
     │              ↑
     │          DANGER!
     │    RefCount drops to 0
     │    while Factory still
     │    holds session reference
     │
     │    Cache eviction fires!
     │    Session logged out!
     │    "Session closed" error!
     │
     └──────┬─────────┬─────────
            │         │
        [USE]    [RELEASE]
        
     No [FACTORY-RETRIEVE]
     No [FACTORY-RELEASE]
     
     Status: EXPOSED   EVICTED    ERROR!
```

## Thread Safety: Cache Key Isolation

```
Thread Pool in Pentaho

pool-1          pool-2          pool-3          pool-4
  |               |               |               |
  └──Session A    └──Session B    └──Session C    └──Session D
     (admin)         (admin)         (jane)         (john)
     Key: [admin,1]  Key: [admin,2]  Key: [jane,3]  Key: [john,4]
     
     ✓ Different keys
     ✓ No collision
     ✓ Independent RefCounts
     ✓ Thread-safe isolation
     
    When all jobs complete:
    
    Session A ──┘ Cache (idle)
    Session B ──┘
    Session C ──┘
    Session D ──┘
    
    All have RefCount=0
    All safe for eviction
```

## Error Path: Exception During Job

```
Normal Path              Exception Path
    |                        |
useSession()              useSession()
RefCount 1→2              RefCount 1→2
    |                        |
doInJcr()                 doInJcr()
(success)                 (throws Exception!)
    |                        |
    └─ action completes      │
    |                        ├─ CATCH RepositoryException
    v                        │
Finally Block            Finally Block
    |                        |
    ├─ releaseSession()      ├─ releaseSession()
    │  RefCount 2→1          │  RefCount 2→1 ✓
    │                        │
    ├─ decrementFactory      ├─ decrementFactory
    │  RefCount 1→0          │  RefCount 1→0 ✓
    │                        │
    └─ return normally       ├─ Rethrow Exception
                             |
                             v
Result: RefCount=0       Result: RefCount=0
SUCCESS                  BALANCED ✓
                         (Exception propagates)
```

## Production Monitoring Dashboard

```
┌─────────────────────────────────────────────────────────┐
│ JCR Session Reference Counting Metrics                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [JCR-FACTORY-RETRIEVE] Count: 1,425 ✓               │
│ [JCR-FACTORY-RELEASE]  Count: 1,425 ✓               │
│ ├─ Match: YES (Balanced!)                           │
│                                                         │
│ [JCR-REFCOUNT-ERROR] Count: 0 ✓                      │
│ ├─ Status: NO ERRORS DETECTED                       │
│                                                         │
│ Active Sessions in Cache: 47 / 100                   │
│ ├─ RefCount=0 (idle): 47                            │
│ ├─ RefCount>0 (in-use): 0  ✓                        │
│                                                         │
│ Average Session Lifetime: 287 seconds               │
│ ├─ Cache eviction timeout: 300 seconds              │
│ ├─ Status: HEALTHY                                 │
│                                                         │
│ Jobs Executed Last Hour: 1,425                      │
│ ├─ Successful: 1,420 (99.6%)  ✓                    │
│ ├─ Failed (ref count): 0  ✓                         │
│ ├─ "Session closed" errors: 0  ✓                   │
│                                                         │
│ Last Error: None  ✓                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Quick Reference: Log Interpretation

```
Log Sequence Analysis

Input Logs:
───────────
TIME: 10:23:45.001
[JCR-FACTORY-RETRIEVE] Thread=pool-1 SessionId=100001 RefCount=1

TIME: 10:23:45.002
[JCR-TEMPLATE-USE] Thread=pool-1 SessionId=100001 RefCount=2

TIME: 10:23:45.105
[JCR-TEMPLATE-RELEASE] Thread=pool-1 SessionId=100001 RefCount=1

TIME: 10:23:45.106
[JCR-FACTORY-RELEASE] Thread=pool-1 SessionId=100001 RefCount=0 (SESSION SAFE FOR EVICTION)

Analysis Results:
─────────────────
✓ All 4 stages present
✓ Single SessionId: 100001
✓ Single Thread: pool-1
✓ RefCount flow: 0→1→2→1→0
✓ Final state: SAFE FOR EVICTION
✓ Duration: 105ms
✓ Status: HEALTHY
```

---

**All diagrams show healthy workflow with factory protection enabled. The fix ensures:**
- ✅ Balanced reference counting
- ✅ Thread-safe session isolation
- ✅ Safe cache eviction
- ✅ Exception resilience
- ✅ No session leaks
