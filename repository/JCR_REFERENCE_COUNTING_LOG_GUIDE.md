# JCR Reference Counting Logging Guide

## Overview
The JCR session factory now includes detailed logging at each reference counting stage. This allows you to monitor and verify that the race condition fix is working correctly.

## Enable Debug Logging

To see the reference counting logs, enable debug level logging for the JCR module:

**In `log4j.properties` or `log4j.xml`:**

```properties
# Enable debug logging for JCR session factory
log4j.logger.org.pentaho.platform.repository2.unified.jcr.sejcr=DEBUG

# Or more specific:
log4j.logger.org.pentaho.platform.repository2.unified.jcr.sejcr.GuavaCachePoolPentahoJcrSessionFactory=DEBUG
log4j.logger.org.pentaho.platform.repository2.unified.jcr.sejcr.PentahoJcrTemplate=DEBUG
```

## Log Message Tags

### 1. **[JCR-FACTORY-RETRIEVE]** - Session Retrieved from Cache
When the factory retrieves a session from cache and increments the reference count.

**Format:**
```
[JCR-FACTORY-RETRIEVE] Thread=<thread-name> SessionId=<hash-code> RefCount=<count> User=<username>
```

**Example:**
```
[JCR-FACTORY-RETRIEVE] Thread=pool-thread-1 SessionId=123456789 RefCount=1 User=admin
```

**What it means:**
- Factory successfully retrieved session
- Reference count incremented to track the retrieval
- Session is now protected from eviction while RefCount > 0

---

### 2. **[JCR-TEMPLATE-USE]** - Template Started Using Session
When a template operation begins and increments the reference count.

**Format:**
```
[JCR-TEMPLATE-USE] Thread=<thread-name> SessionId=<hash-code> RefCount=<count> (template acquisition)
```

**Example:**
```
[JCR-TEMPLATE-USE] Thread=pool-thread-2 SessionId=123456789 RefCount=2 (template acquisition)
```

**What it means:**
- Template is beginning to execute
- Reference count is now 2 (factory + template)
- Session is locked for use

---

### 3. **[JCR-TEMPLATE-RELEASE]** - Template Finished Using Session
When a template operation completes and decrements the reference count.

**Format:**
```
[JCR-TEMPLATE-RELEASE] Thread=<thread-name> SessionId=<hash-code> RefCount=<count> (template release)
```

**Example:**
```
[JCR-TEMPLATE-RELEASE] Thread=pool-thread-2 SessionId=123456789 RefCount=1 (template release)
```

**What it means:**
- Template operation completed
- Reference count decremented
- Factory still holds reference (RefCount=1)
- Session still protected from eviction

---

### 4. **[JCR-FACTORY-RELEASE]** - Factory Released Session Reference
When the factory finally releases its reference to return session to cache.

**Format:**
```
[JCR-FACTORY-RELEASE] Thread=<thread-name> SessionId=<hash-code> RefCount=<count> (factory protection release - SESSION SAFE FOR EVICTION)
```

**Example (when RefCount=0):**
```
[JCR-FACTORY-RELEASE] Thread=pool-thread-1 SessionId=123456789 RefCount=0 (factory protection release - SESSION SAFE FOR EVICTION)
```

**Example (when RefCount>0):**
```
[JCR-FACTORY-RELEASE] Thread=pool-thread-1 SessionId=123456789 RefCount=1 (factory protection release)
```

**What it means:**
- Factory released its protection reference
- RefCount=0: Session is now safe for cache eviction
- RefCount>0: Other threads still using it, NOT evicted

---

### 5. **[JCR-REFCOUNT-ERROR]** - Reference Counting Imbalance
**CRITICAL** - This indicates a bug in reference counting (more decrements than increments).

**Format:**
```
[JCR-REFCOUNT-ERROR] Usage count went negative; factory protection decrement imbalance: SessionId=<hash-code> RefCount=<negative-number> Session=<session>
```

**Example:**
```
[JCR-REFCOUNT-ERROR] Usage count went negative; factory protection decrement imbalance: SessionId=123456789 RefCount=-1 Session=Session@123456789
```

**What it means:**
- ⚠️ **BUG DETECTED**: Reference count went negative
- This should NEVER happen with the fix
- **Action**: Contact Pentaho support immediately with logs

---

## Life Cycle Example

Here's what a complete session lifecycle looks like in the logs:

```
# Session retrieved from cache (factory protection acquired)
[JCR-FACTORY-RETRIEVE] Thread=pool-1 SessionId=100001 RefCount=1 User=admin

# Template operation starts (template protection acquired)
[JCR-TEMPLATE-USE] Thread=pool-1 SessionId=100001 RefCount=2 (template acquisition)

# ... (operation executes) ...

# Template operation completes (template protection released)
[JCR-TEMPLATE-RELEASE] Thread=pool-1 SessionId=100001 RefCount=1 (template release)

# Factory releases session (factory protection released)
[JCR-FACTORY-RELEASE] Thread=pool-1 SessionId=100001 RefCount=0 (factory protection release - SESSION SAFE FOR EVICTION)

# Session can now be evicted from cache if needed
```

---

## Monitoring Checklist

Use these logs to verify the system is working correctly:

✅ **Expected patterns:**
1. For every [JCR-FACTORY-RETRIEVE], RefCount goes from 0→1
2. For every [JCR-TEMPLATE-USE], RefCount increments by 1
3. For every [JCR-TEMPLATE-RELEASE], RefCount decrements by 1
4. For every [JCR-FACTORY-RELEASE], RefCount decrements by 1
5. RefCount should return to 0 after all operations complete
6. RefCount should NEVER be negative
7. When RefCount=0, you should see "SESSION SAFE FOR EVICTION" message

❌ **Red flags:**
1. [JCR-REFCOUNT-ERROR] messages → Reference counting bug
2. RefCount going negative → Imbalance detected
3. RefCount never reaching 0 → Session leak
4. Missing [JCR-FACTORY-RELEASE] logs → Sessions not being released
5. Rapid increase in RefCount without corresponding decrease → Memory leak

---

## Sample Log Analysis

### ✅ Healthy session lifecycle (GOOD):

```
2026-04-19 10:23:45,123 DEBUG [JCR-FACTORY-RETRIEVE] Thread=pool-1 SessionId=100001 RefCount=1 User=admin
2026-04-19 10:23:45,124 DEBUG [JCR-TEMPLATE-USE] Thread=pool-1 SessionId=100001 RefCount=2 (template acquisition)
2026-04-19 10:23:45,200 DEBUG [JCR-TEMPLATE-RELEASE] Thread=pool-1 SessionId=100001 RefCount=1 (template release)
2026-04-19 10:23:45,201 DEBUG [JCR-FACTORY-RELEASE] Thread=pool-1 SessionId=100001 RefCount=0 (factory protection release - SESSION SAFE FOR EVICTION)
```

### ❌ Problem: Imbalanced decrements (BAD):

```
2026-04-19 10:23:45,123 DEBUG [JCR-FACTORY-RETRIEVE] Thread=pool-1 SessionId=100001 RefCount=1 User=admin
2026-04-19 10:23:45,124 DEBUG [JCR-TEMPLATE-USE] Thread=pool-1 SessionId=100001 RefCount=2 (template acquisition)
2026-04-19 10:23:45,200 DEBUG [JCR-TEMPLATE-RELEASE] Thread=pool-1 SessionId=100001 RefCount=1 (template release)
2026-04-19 10:23:45,201 DEBUG [JCR-TEMPLATE-RELEASE] Thread=pool-1 SessionId=100001 RefCount=0 (template release)
2026-04-19 10:23:45,202 WARN  [JCR-REFCOUNT-ERROR] Usage count went negative; factory protection decrement imbalance: SessionId=100001 RefCount=-1 Session=...
```
→ Extra decrement! Check code for duplicate cleanup

---

## Viewing Logs

**For Pentaho Server:**

```bash
# Linux/Mac
tail -f ~/Builds/ps-ee-10.2.0.5/pentaho-server/tomcat/logs/catalina.out | grep "JCR-"

# Windows
Get-Content C:\Builds\ps-ee-10.2.0.5\pentaho-server\tomcat\logs\catalina.out -Tail 100 -Wait | Select-String "JCR-"
```

**Grep for specific stages:**

```bash
# See all reference counting operations
grep "JCR-FACTORY-RETRIEVE\|JCR-TEMPLATE-USE\|JCR-TEMPLATE-RELEASE\|JCR-FACTORY-RELEASE" catalina.out

# Find errors
grep "JCR-REFCOUNT-ERROR" catalina.out

# Trace specific session (replace 100001 with SessionId)
grep "SessionId=100001" catalina.out

# Count operations
grep -c "JCR-FACTORY-RETRIEVE" catalina.out
grep -c "JCR-FACTORY-RELEASE" catalina.out
```

---

## Performance Notes

- Debug logging has **minimal performance impact** (only when debug level is enabled)
- Each operation logs: thread name, session ID, reference count, and context
- Logs are written to the standard Pentaho catalina.out log
- Use log rotation to manage log file size

---

## Contact Support

If you see [JCR-REFCOUNT-ERROR] or unexpected patterns:

1. **Enable debug logging** for the JCR classes
2. **Reproduce the issue** while logging is enabled
3. **Capture the logs** showing the problem sequence
4. **Contact Pentaho support** with:
   - The complete log sequence
   - Steps to reproduce
   - Pentaho version and environment info

Include this file reference: **JCR Reference Counting Logging Guide**
