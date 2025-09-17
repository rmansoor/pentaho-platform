# Pentaho Scheduler Component - High Level Design

## 1. Overview

The Pentaho Scheduler is a comprehensive job scheduling system built on top of the Quartz Scheduler framework. It provides enterprise-grade scheduling capabilities for reports, data transformations, and custom actions within the Pentaho platform ecosystem.

### 1.1 Purpose
- Schedule and execute automated tasks (reports, ETL jobs, custom actions)
- Provide flexible trigger mechanisms (simple, cron-based, complex)
- Manage job lifecycle and execution monitoring
- Ensure security and permission-based access control
- Support enterprise features like blockout periods and audit trails

### 1.2 Key Features
- Multiple trigger types for flexible scheduling
- User permission management and job ownership
- Real-time job execution monitoring
- Generated content management
- Blockout period support
- Enterprise audit and logging
- REST API for external integration

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pentaho Scheduler Architecture               │
├─────────────────────────────────────────────────────────────────┤
│  Client Layer                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐│
│  │   Web UI     │ │   REST API   │ │   External Applications  ││
│  │  (Spoon/PUC) │ │   Clients    │ │                          ││
│  └──────────────┘ └──────────────┘ └──────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  API Layer                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │            Scheduler REST API Controller                    ││
│  │  (EnterpriseSchedulerService / SchedulerService)           ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Service Layer                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐│
│  │   Security   │ │ Permission   │ │     Job Builder         ││
│  │   Manager    │ │   Manager    │ │     Service             ││
│  └──────────────┘ └──────────────┘ └─────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Core Scheduler Layer                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                IScheduler Interface                         ││
│  │  ┌─────────────────┐  ┌─────────────────────────────────────┐││
│  │  │ QuartzScheduler │  │  EnterpriseScheduler (EE)           │││
│  │  │    (Core)       │  │  - Enhanced Persistence             │││
│  │  │                 │  │  - Email Integration                │││
│  │  │                 │  │  - VFS Support                      │││
│  │  └─────────────────┘  └─────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Job Execution Layer                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐│
│  │    Action    │ │   Trigger    │ │     Execution           ││
│  │   Handlers   │ │   Manager    │ │     Monitor             ││
│  └──────────────┘ └──────────────┘ └─────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Data Persistence Layer                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐│
│  │   Quartz     │ │   Job State  │ │    Generated Content    ││
│  │  Database    │ │   Storage    │ │       Repository        ││
│  └──────────────┘ └──────────────┘ └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 3. Core Components

### 3.1 IScheduler Interface
**Purpose**: Central abstraction layer for all scheduling operations

**Responsibilities**:
- Define standard scheduling operations (create, update, delete, pause, resume)
- Provide trigger management capabilities
- Abstract implementation details from clients

**Key Methods**:
```java
public interface IScheduler {
    Job createJob(JobScheduleRequest jobRequest) throws SchedulerException;
    void updateJob(String jobId, JobScheduleRequest jobRequest) throws SchedulerException;
    void removeJob(String jobId) throws SchedulerException;
    void pauseJob(String jobId) throws SchedulerException;
    void resumeJob(String jobId) throws SchedulerException;
    void triggerNow(String jobId) throws SchedulerException;
    SchedulerStatus getStatus() throws SchedulerException;
    List<Job> getJobs(IJobFilter filter) throws SchedulerException;
}
```

### 3.2 QuartzScheduler Implementation
**Purpose**: Core scheduler implementation using Quartz framework

**Key Features**:
- Job persistence and clustering support
- Trigger management (Simple, Cron, Complex)
- Job execution coordination
- State management and recovery

**Configuration**:
```properties
org.quartz.scheduler.instanceName = PentahoQuartzScheduler
org.quartz.scheduler.instanceId = AUTO
org.quartz.scheduler.rmi.export = false
org.quartz.scheduler.rmi.proxy = false
org.quartz.threadPool.class = org.quartz.simpl.SimpleThreadPool
org.quartz.threadPool.threadCount = 10
org.quartz.jobStore.class = org.quartz.impl.jdbcjobstore.JobStoreTX
```

### 3.3 EnterpriseScheduler (EE)
**Purpose**: Enhanced scheduler with enterprise features

**Additional Features**:
- Advanced persistence options
- Email notification integration
- VFS (Virtual File System) support
- Enhanced audit logging
- Multi-tenant support

### 3.4 Job Builder Service
**Purpose**: Constructs and validates job configurations

**Responsibilities**:
- Build JobScheduleRequest objects from API inputs
- Validate job parameters and triggers
- Apply default configurations
- Handle PDI-specific parameters

## 4. Trigger System Design

### 4.1 Trigger Types

#### Simple Trigger
```java
public class SimpleJobTrigger {
    private Date startTime;
    private Date endTime;
    private int repeatCount;
    private long repeatInterval;
    private String uiPassParam;
}
```

**Use Cases**:
- One-time execution
- Simple repeating jobs
- Fixed interval scheduling

#### Cron Trigger
```java
public class CronJobTrigger {
    private String cronString;
    private Date startTime;
    private Date endTime;
    private String timeZone;
    private long duration;
}
```

**Use Cases**:
- Complex time-based scheduling
- Business hour restrictions
- Calendar-based execution

#### Complex Trigger
```java
public class ComplexJobTrigger {
    private String cronString;
    private Date startTime;
    private Date endTime;
    private String timeZone;
    private int[] daysOfWeek;
    private int[] daysOfMonth;
    private int[] weeksOfMonth;
    private int[] months;
    private int[] years;
}
```

**Use Cases**:
- Multi-criteria scheduling
- Business-specific calendars
- Advanced scheduling patterns

### 4.2 Trigger Resolution Strategy
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Parse Request  │───▶│  Validate       │───▶│  Create Quartz  │
│                 │    │  Parameters     │    │  Trigger        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Determine      │    │  Apply Time     │    │  Register with  │
│  Trigger Type   │    │  Zone Settings  │    │  Scheduler      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 5. Security and Permission Model

### 5.1 Permission Levels
- **SCHEDULE**: Can create and manage own jobs
- **EXECUTE**: Can trigger immediate execution
- **ADMIN**: Can manage all jobs and scheduler state
- **READ**: Can view job status and history

### 5.2 Security Flow
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Request   │───▶│  Authentication │───▶│  Authorization  │
│                 │    │   (Spring Sec.) │    │   Check         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Extract User   │    │  Check File     │    │  Execute        │
│  Context        │    │  Permissions    │    │  Operation      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 5.3 Job Ownership Model
- Jobs are owned by the creating user
- Owners can modify/delete their jobs
- Admins can manage all jobs
- Delegation support for service accounts

## 6. Job Execution Engine

### 6.1 Execution Flow
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Trigger Fires  │───▶│  Load Job       │───▶│  Validate       │
│                 │    │  Definition     │    │  Execution      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Check Blockout │    │  Create         │    │  Execute Job    │
│  Periods        │    │  Execution      │    │  Action         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Log Execution  │    │  Handle         │    │  Store Results  │
│  Start          │    │  Failures       │    │  & Cleanup      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 6.2 Action Types
- **ReportAction**: Generate and distribute reports
- **EmailAction**: Send email notifications
- **SqlAction**: Execute SQL statements
- **ScriptAction**: Run shell scripts
- **CustomAction**: User-defined actions

### 6.3 Execution Context
```java
public class ExecutionContext {
    private String jobId;
    private String executionId;
    private Map<String, String> jobParameters;
    private Map<String, String> pdiParameters;
    private String userId;
    private Date scheduledTime;
    private Date actualTime;
    private String logLevel;
    private boolean safeMode;
    private boolean gatheringMetrics;
}
```

## 7. Data Model

### 7.1 Core Entities

#### Job Entity
```sql
CREATE TABLE QRTZ_PENTAHO_JOBS (
    JOB_ID VARCHAR(255) PRIMARY KEY,
    JOB_NAME VARCHAR(255) NOT NULL,
    DESCRIPTION TEXT,
    USER_NAME VARCHAR(255) NOT NULL,
    INPUT_FILE VARCHAR(500),
    OUTPUT_FILE VARCHAR(500),
    ACTION_CLASS VARCHAR(255),
    JOB_STATE VARCHAR(50),
    CREATED_TIME TIMESTAMP,
    MODIFIED_TIME TIMESTAMP
);
```

#### Job Parameters
```sql
CREATE TABLE QRTZ_PENTAHO_JOB_PARAMS (
    JOB_ID VARCHAR(255),
    PARAM_NAME VARCHAR(255),
    PARAM_VALUE TEXT,
    PARAM_TYPE VARCHAR(50),
    FOREIGN KEY (JOB_ID) REFERENCES QRTZ_PENTAHO_JOBS(JOB_ID)
);
```

#### Execution History
```sql
CREATE TABLE QRTZ_PENTAHO_EXECUTIONS (
    EXECUTION_ID VARCHAR(255) PRIMARY KEY,
    JOB_ID VARCHAR(255),
    START_TIME TIMESTAMP,
    END_TIME TIMESTAMP,
    STATUS VARCHAR(50),
    RESULT TEXT,
    ERROR_MESSAGE TEXT,
    LINES_READ BIGINT,
    LINES_WRITTEN BIGINT,
    FOREIGN KEY (JOB_ID) REFERENCES QRTZ_PENTAHO_JOBS(JOB_ID)
);
```

#### Blockout Periods
```sql
CREATE TABLE QRTZ_PENTAHO_BLOCKOUTS (
    BLOCKOUT_ID VARCHAR(255) PRIMARY KEY,
    NAME VARCHAR(255) NOT NULL,
    DESCRIPTION TEXT,
    START_TIME TIMESTAMP,
    END_TIME TIMESTAMP,
    IS_RECURRING BOOLEAN,
    CRON_EXPRESSION VARCHAR(255),
    DURATION BIGINT,
    CREATED_BY VARCHAR(255),
    CREATED_TIME TIMESTAMP
);
```

### 7.2 Generated Content Storage
```
Repository Structure:
/system/schedules/
├── jobs/
│   ├── {job-id}/
│   │   ├── metadata.json
│   │   └── generated-content/
│   │       ├── {execution-id}/
│   │       │   ├── report.pdf
│   │       │   ├── data.csv
│   │       │   └── execution-log.txt
│   │       └── latest/
└── templates/
    ├── email-templates/
    └── report-templates/
```

## 8. API Design Patterns

### 8.1 RESTful Resource Design
```
/scheduler/
├── jobs/                           # Job collection
│   ├── {jobId}/                   # Individual job
│   ├── {jobId}/pause              # Job control actions
│   ├── {jobId}/resume
│   ├── {jobId}/execute
│   ├── {jobId}/history            # Job execution history
│   └── {jobId}/generated-content  # Generated files
├── state/                         # Scheduler state management
├── permissions/                   # Permission checking
│   ├── can-schedule
│   └── can-execute
└── blockouts/                     # Blockout period management
```

### 8.2 Response Standardization
```json
{
  "success": true,
  "data": { /* Resource data */ },
  "metadata": {
    "totalCount": 100,
    "hasMore": true,
    "requestId": "req-123"
  },
  "errors": []
}
```

### 8.3 Error Handling Strategy
```java
@ControllerAdvice
public class SchedulerExceptionHandler {
    @ExceptionHandler(SchedulerException.class)
    public ResponseEntity<ErrorResponse> handleSchedulerException(SchedulerException e) {
        // Standardized error response
    }
    
    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<ErrorResponse> handleSecurityException(SecurityException e) {
        // Security-specific error handling
    }
}
```

## 9. Configuration Management

### 9.1 Scheduler Configuration
```yaml
pentaho:
  scheduler:
    enabled: true
    threadPool:
      size: 10
      priority: 5
    persistence:
      enabled: true
      datasource: "schedulerDataSource"
    clustering:
      enabled: false
      instanceId: "AUTO"
    monitoring:
      enabled: true
      metricsInterval: 60000
```

### 9.2 Job Defaults Configuration
```yaml
pentaho:
  scheduler:
    jobDefaults:
      timeZone: "UTC"
      logLevel: "INFO"
      safeMode: false
      gatheringMetrics: true
      maxExecutionTime: 3600000  # 1 hour
      retryCount: 3
      retryInterval: 300000      # 5 minutes
```

## 10. Monitoring and Observability

### 10.1 Metrics Collection
- Job execution counts and durations
- Scheduler queue depth
- Error rates and types
- Resource utilization

### 10.2 Health Checks
```java
@Component
public class SchedulerHealthIndicator implements HealthIndicator {
    @Override
    public Health health() {
        // Check scheduler status
        // Verify database connectivity
        // Validate configuration
        return Health.up()
            .withDetail("schedulerState", getSchedulerState())
            .withDetail("activeJobs", getActiveJobCount())
            .build();
    }
}
```

### 10.3 Audit Logging
```java
@EventListener
public class SchedulerAuditListener {
    public void onJobCreated(JobCreatedEvent event) {
        auditService.log("JOB_CREATED", event.getJobId(), event.getUserId());
    }
    
    public void onJobExecuted(JobExecutedEvent event) {
        auditService.log("JOB_EXECUTED", event.getJobId(), event.getExecutionResult());
    }
}
```

## 11. Optimization Strategies

### 11.1 Performance Optimizations

#### 11.1.1 Database Optimizations
```sql
-- Optimize Quartz tables with proper indexing
CREATE INDEX idx_qrtz_j_req_recovery ON qrtz_job_details(SCHED_NAME,REQUESTS_RECOVERY);
CREATE INDEX idx_qrtz_j_grp ON qrtz_job_details(SCHED_NAME,JOB_GROUP);
CREATE INDEX idx_qrtz_t_j ON qrtz_triggers(SCHED_NAME,JOB_NAME,JOB_GROUP);
CREATE INDEX idx_qrtz_t_jg ON qrtz_triggers(SCHED_NAME,JOB_GROUP);
CREATE INDEX idx_qrtz_t_c ON qrtz_triggers(SCHED_NAME,CALENDAR_NAME);
CREATE INDEX idx_qrtz_t_g ON qrtz_triggers(SCHED_NAME,TRIGGER_GROUP);
CREATE INDEX idx_qrtz_t_state ON qrtz_triggers(SCHED_NAME,TRIGGER_STATE);
CREATE INDEX idx_qrtz_t_n_state ON qrtz_triggers(SCHED_NAME,TRIGGER_NAME,TRIGGER_GROUP,TRIGGER_STATE);
CREATE INDEX idx_qrtz_t_n_g_state ON qrtz_triggers(SCHED_NAME,TRIGGER_GROUP,TRIGGER_STATE);
CREATE INDEX idx_qrtz_t_next_fire_time ON qrtz_triggers(SCHED_NAME,NEXT_FIRE_TIME);
CREATE INDEX idx_qrtz_t_nft_st ON qrtz_triggers(SCHED_NAME,TRIGGER_STATE,NEXT_FIRE_TIME);
CREATE INDEX idx_qrtz_t_nft_misfire ON qrtz_triggers(SCHED_NAME,MISFIRE_INSTR,NEXT_FIRE_TIME);
CREATE INDEX idx_qrtz_t_nft_st_misfire ON qrtz_triggers(SCHED_NAME,MISFIRE_INSTR,NEXT_FIRE_TIME,TRIGGER_STATE);
CREATE INDEX idx_qrtz_t_nft_st_misfire_grp ON qrtz_triggers(SCHED_NAME,MISFIRE_INSTR,NEXT_FIRE_TIME,TRIGGER_GROUP,TRIGGER_STATE);

-- Partition large execution history tables by date
CREATE TABLE qrtz_pentaho_executions_2025_01 PARTITION OF qrtz_pentaho_executions
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Archive old execution data
CREATE PROCEDURE archive_old_executions()
BEGIN
    INSERT INTO qrtz_pentaho_executions_archive 
    SELECT * FROM qrtz_pentaho_executions 
    WHERE end_time < DATE_SUB(NOW(), INTERVAL 90 DAY);
    
    DELETE FROM qrtz_pentaho_executions 
    WHERE end_time < DATE_SUB(NOW(), INTERVAL 90 DAY);
END;
```

#### 11.1.2 Caching Strategies
```java
@Configuration
@EnableCaching
public class SchedulerCacheConfig {
    
    @Bean
    @Primary
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(caffeineCacheBuilder());
        return cacheManager;
    }
    
    Caffeine<Object, Object> caffeineCacheBuilder() {
        return Caffeine.newBuilder()
            .initialCapacity(100)
            .maximumSize(500)
            .expireAfterAccess(30, TimeUnit.MINUTES)
            .weakKeys()
            .recordStats();
    }
}

@Service
public class OptimizedSchedulerService {
    
    @Cacheable(value = "jobMetadata", key = "#jobId")
    public JobMetadata getJobMetadata(String jobId) {
        // Cache frequently accessed job metadata
    }
    
    @Cacheable(value = "userPermissions", key = "#userId + '_' + #fileId")
    public boolean hasSchedulePermission(String userId, String fileId) {
        // Cache permission checks to avoid repeated database queries
    }
    
    @Cacheable(value = "triggerNextFireTimes", key = "#jobId")
    public Date getNextFireTime(String jobId) {
        // Cache trigger calculations
    }
}
```

#### 11.1.3 Connection Pool Optimization
```yaml
pentaho:
  scheduler:
    datasource:
      type: com.zaxxer.hikari.HikariDataSource
      hikari:
        pool-name: SchedulerHikariPool
        minimum-idle: 10
        maximum-pool-size: 50
        idle-timeout: 300000
        max-lifetime: 1200000
        connection-timeout: 20000
        validation-timeout: 5000
        leak-detection-threshold: 60000
        connection-test-query: SELECT 1
        connection-init-sql: SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED
```

#### 11.1.4 Thread Pool Optimization
```java
@Configuration
public class SchedulerThreadPoolConfig {
    
    @Bean
    public TaskExecutor schedulerTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(200);
        executor.setKeepAliveSeconds(60);
        executor.setThreadNamePrefix("scheduler-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        return executor;
    }
    
    @Bean
    public TaskExecutor jobExecutionTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(20);
        executor.setMaxPoolSize(100);
        executor.setQueueCapacity(500);
        executor.setKeepAliveSeconds(300);
        executor.setThreadNamePrefix("job-exec-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        return executor;
    }
}
```

### 11.2 Memory Optimization

#### 11.2.1 Lazy Loading Implementation
```java
@Entity
public class Job {
    @Id
    private String jobId;
    
    // Eagerly loaded core fields
    private String jobName;
    private String userName;
    private JobState state;
    
    // Lazy loaded collections to reduce memory footprint
    @OneToMany(fetch = FetchType.LAZY, mappedBy = "job")
    private List<JobParameter> parameters;
    
    @OneToMany(fetch = FetchType.LAZY, mappedBy = "job")
    private List<JobExecution> executions;
    
    // Only load execution history when explicitly requested
    @Transient
    public List<JobExecution> getRecentExecutions(int limit) {
        return executionRepository.findRecentByJobId(jobId, limit);
    }
}
```

#### 11.2.2 Pagination and Streaming
```java
@RestController
public class OptimizedSchedulerController {
    
    @GetMapping("/scheduler/jobs")
    public ResponseEntity<PagedResponse<Job>> getJobs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String filter) {
        
        Pageable pageable = PageRequest.of(page, size);
        Page<Job> jobs = jobRepository.findWithFilter(filter, pageable);
        
        return ResponseEntity.ok(PagedResponse.of(jobs));
    }
    
    @GetMapping(value = "/scheduler/jobs/export", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> exportJobs() {
        StreamingResponseBody stream = outputStream -> {
            jobRepository.findAllStream().forEach(job -> {
                try {
                    outputStream.write(jobSerializer.serialize(job));
                    outputStream.flush();
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            });
        };
        return ResponseEntity.ok(stream);
    }
}
```

### 11.3 Scalability Optimizations

#### 11.3.1 Horizontal Scaling with Load Balancing
```yaml
# Load Balancer Configuration (HAProxy)
global
    daemon

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend scheduler_frontend
    bind *:8080
    default_backend scheduler_servers

backend scheduler_servers
    balance roundrobin
    option httpchk GET /scheduler/health
    server scheduler1 scheduler-node1:8080 check
    server scheduler2 scheduler-node2:8080 check
    server scheduler3 scheduler-node3:8080 check
```

#### 11.3.2 Quartz Clustering Configuration
```properties
# Optimized Quartz clustering properties
org.quartz.scheduler.instanceName = PentahoSchedulerCluster
org.quartz.scheduler.instanceId = AUTO
org.quartz.scheduler.jmx.export = true

# Enhanced thread pool for clustering
org.quartz.threadPool.class = org.quartz.simpl.SimpleThreadPool
org.quartz.threadPool.threadCount = 25
org.quartz.threadPool.threadPriority = 5
org.quartz.threadPool.threadsInheritContextClassLoaderOfInitializingThread = true

# Optimized JDBC job store for clustering
org.quartz.jobStore.class = org.quartz.impl.jdbcjobstore.JobStoreTX
org.quartz.jobStore.driverDelegateClass = org.quartz.impl.jdbcjobstore.PostgreSQLDelegate
org.quartz.jobStore.useProperties = true
org.quartz.jobStore.dataSource = schedulerDS
org.quartz.jobStore.tablePrefix = QRTZ_
org.quartz.jobStore.isClustered = true
org.quartz.jobStore.clusterCheckinInterval = 20000
org.quartz.jobStore.maxMisfiresToHandleAtATime = 20
org.quartz.jobStore.misfireThreshold = 60000
org.quartz.jobStore.txIsolationLevelSerializable = false

# Connection pool optimization
org.quartz.dataSource.schedulerDS.driver = org.postgresql.Driver
org.quartz.dataSource.schedulerDS.URL = jdbc:postgresql://db-cluster:5432/scheduler
org.quartz.dataSource.schedulerDS.user = scheduler
org.quartz.dataSource.schedulerDS.password = ${SCHEDULER_DB_PASSWORD}
org.quartz.dataSource.schedulerDS.maxConnections = 30
org.quartz.dataSource.schedulerDS.validationQuery = SELECT 1
```

### 11.4 Execution Optimization

#### 11.4.1 Job Prioritization and Queue Management
```java
@Component
public class PriorityJobQueue {
    
    private final PriorityBlockingQueue<PriorityJob> highPriorityQueue = 
        new PriorityBlockingQueue<>(100, Comparator.comparing(PriorityJob::getPriority).reversed());
    
    private final BlockingQueue<Job> normalQueue = new LinkedBlockingQueue<>(500);
    
    @Async("jobExecutionTaskExecutor")
    public CompletableFuture<Void> executeJob(Job job) {
        if (job.getPriority() > 7) {
            return executeHighPriorityJob(job);
        } else {
            return executeNormalJob(job);
        }
    }
    
    @Scheduled(fixedDelay = 1000)
    public void processQueues() {
        // Process high priority jobs first
        PriorityJob highPriorityJob = highPriorityQueue.poll();
        if (highPriorityJob != null) {
            jobExecutor.execute(highPriorityJob);
            return;
        }
        
        // Then process normal jobs
        Job normalJob = normalQueue.poll();
        if (normalJob != null) {
            jobExecutor.execute(normalJob);
        }
    }
}
```

#### 11.4.2 Resource-Based Job Scheduling
```java
@Service
public class ResourceAwareScheduler {
    
    private final SystemResourceMonitor resourceMonitor;
    private final JobResourceEstimator resourceEstimator;
    
    public boolean canScheduleJob(Job job) {
        JobResourceRequirement requirement = resourceEstimator.estimate(job);
        SystemResources available = resourceMonitor.getAvailableResources();
        
        return available.getCpuPercent() + requirement.getCpuPercent() < 80 &&
               available.getMemoryMB() + requirement.getMemoryMB() < available.getTotalMemoryMB() * 0.9;
    }
    
    @EventListener
    public void onSystemResourcesLow(SystemResourcesLowEvent event) {
        // Pause low priority jobs when resources are constrained
        List<Job> lowPriorityJobs = jobRepository.findByPriorityLessThan(5);
        lowPriorityJobs.forEach(job -> {
            schedulerService.pauseJob(job.getJobId());
            auditService.log("JOB_PAUSED_RESOURCE_CONSTRAINT", job.getJobId());
        });
    }
}
```

### 11.5 Network and I/O Optimization

#### 11.5.1 Asynchronous Processing
```java
@Service
public class AsyncJobProcessor {
    
    @Async("jobExecutionTaskExecutor")
    public CompletableFuture<JobExecutionResult> processJobAsync(Job job) {
        try {
            JobExecutionResult result = executeJob(job);
            notificationService.sendJobCompletionNotification(job, result);
            return CompletableFuture.completedFuture(result);
        } catch (Exception e) {
            notificationService.sendJobFailureNotification(job, e);
            return CompletableFuture.failedFuture(e);
        }
    }
    
    @EventListener
    @Async
    public void onJobCompleted(JobCompletedEvent event) {
        // Asynchronously handle post-completion tasks
        cleanupTempFiles(event.getJobId());
        updateJobStatistics(event.getJobId(), event.getExecutionResult());
        archiveOldExecutions(event.getJobId());
    }
}
```

#### 11.5.2 Batch Operations
```java
@Service
public class BatchJobOperations {
    
    @Transactional
    public void pauseJobsBatch(List<String> jobIds) {
        // Batch pause operations to reduce database round trips
        jobRepository.updateJobStatesBatch(jobIds, JobState.PAUSED);
        
        // Batch audit logging
        List<AuditEntry> auditEntries = jobIds.stream()
            .map(jobId -> new AuditEntry("JOB_PAUSED", jobId, getCurrentUser()))
            .collect(Collectors.toList());
        auditRepository.saveAll(auditEntries);
    }
    
    public void scheduleJobsBatch(List<JobScheduleRequest> requests) {
        List<Job> jobs = requests.parallelStream()
            .map(this::buildJob)
            .collect(Collectors.toList());
        
        jobRepository.saveAll(jobs);
        
        // Batch register with Quartz
        jobs.forEach(job -> quartzScheduler.scheduleJob(job.getJobDetail(), job.getTrigger()));
    }
}
```

### 11.6 Monitoring and Performance Tuning

#### 11.6.1 Performance Metrics Collection
```java
@Component
public class SchedulerPerformanceMetrics {
    
    private final MeterRegistry meterRegistry;
    private final Timer jobExecutionTimer;
    private final Counter jobSuccessCounter;
    private final Counter jobFailureCounter;
    private final Gauge queueDepthGauge;
    
    public SchedulerPerformanceMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.jobExecutionTimer = Timer.builder("scheduler.job.execution")
            .description("Job execution time")
            .register(meterRegistry);
        this.jobSuccessCounter = Counter.builder("scheduler.job.success")
            .description("Successful job executions")
            .register(meterRegistry);
        this.jobFailureCounter = Counter.builder("scheduler.job.failure")
            .description("Failed job executions")
            .register(meterRegistry);
        this.queueDepthGauge = Gauge.builder("scheduler.queue.depth")
            .description("Current queue depth")
            .register(meterRegistry, this, SchedulerPerformanceMetrics::getQueueDepth);
    }
    
    public void recordJobExecution(Job job, Duration executionTime, boolean success) {
        jobExecutionTimer.record(executionTime);
        if (success) {
            jobSuccessCounter.increment(Tags.of("jobType", job.getActionClass()));
        } else {
            jobFailureCounter.increment(Tags.of("jobType", job.getActionClass()));
        }
    }
    
    private double getQueueDepth() {
        return jobQueue.size();
    }
}
```

#### 11.6.2 Automatic Performance Tuning
```java
@Component
public class AdaptiveSchedulerTuning {
    
    @Scheduled(fixedRate = 300000) // Every 5 minutes
    public void adaptiveThreadPoolTuning() {
        double cpuUsage = systemResourceMonitor.getCpuUsage();
        int queueSize = jobQueue.size();
        int activeThreads = threadPoolExecutor.getActiveCount();
        
        if (cpuUsage < 50 && queueSize > 100) {
            // Increase thread pool size if CPU is underutilized and queue is growing
            int newSize = Math.min(threadPoolExecutor.getMaximumPoolSize() + 5, 100);
            threadPoolExecutor.setMaximumPoolSize(newSize);
            logger.info("Increased thread pool size to {}", newSize);
        } else if (cpuUsage > 90 && activeThreads > 20) {
            // Decrease thread pool size if CPU is overloaded
            int newSize = Math.max(threadPoolExecutor.getMaximumPoolSize() - 5, 10);
            threadPoolExecutor.setMaximumPoolSize(newSize);
            logger.info("Decreased thread pool size to {}", newSize);
        }
    }
    
    @EventListener
    public void onHighMemoryUsage(HighMemoryUsageEvent event) {
        // Reduce cache sizes when memory is low
        cacheManager.getCache("jobMetadata").clear();
        cacheManager.getCache("userPermissions").clear();
        
        // Force garbage collection
        System.gc();
        
        logger.warn("Cleared caches due to high memory usage: {}%", event.getMemoryUsage());
    }
}
```

### 11.7 Resource Management and Limits

```yaml
pentaho:
  scheduler:
    optimization:
      # Thread pool configuration
      threadPool:
        coreSize: 10
        maxSize: 50
        queueCapacity: 200
        keepAliveSeconds: 60
      
      # Memory management
      memory:
        maxHeapUsage: 80  # percentage
        cacheMaxSize: 1000
        cacheExpireAfterAccess: 30  # minutes
      
      # Database optimization
      database:
        connectionPool:
          minIdle: 5
          maxActive: 30
          maxWait: 30000
        batchSize: 100
        fetchSize: 1000
      
      # Job execution limits
      execution:
        maxConcurrentJobs: 25
        maxJobExecutionTime: 3600000  # 1 hour
        jobTimeoutWarning: 2700000    # 45 minutes
        maxRetryAttempts: 3
        retryBackoffMultiplier: 2
      
      # Cleanup and maintenance
      cleanup:
        executionHistoryRetentionDays: 90
        tempFileCleanupInterval: 3600000  # 1 hour
        deadJobCleanupInterval: 86400000  # 24 hours
        statisticsAggregationInterval: 300000  # 5 minutes
```

These optimization strategies provide comprehensive performance improvements across all aspects of the scheduler system, from database operations to job execution and resource management.

## 12. Integration Points

### 12.1 Pentaho Platform Integration
- Repository integration for file access
- User management system integration
- Audit system integration
- Notification system integration

### 12.2 External System Integration
- LDAP/Active Directory authentication
- SMTP servers for email actions
- FTP/SFTP servers for file operations
- Database connections for SQL actions

### 12.3 Plugin Architecture
```java
public interface SchedulerPlugin {
    String getPluginId();
    void initialize(SchedulerContext context);
    List<ActionClass> getProvidedActions();
    void shutdown();
}
```

## 13. Deployment Considerations

### 13.1 Environment Configuration
- Development: Single instance, H2 database
- Testing: Multi-instance, PostgreSQL database
- Production: Clustered, enterprise database with failover

### 13.2 Migration Strategy
- Database schema versioning
- Job definition migration utilities
- Backward compatibility maintenance

### 13.3 Backup and Recovery
- Regular database backups
- Generated content archival
- Configuration backup procedures

## 14. Microservices Migration Plan

### 14.1 Migration Strategy Overview

Converting the monolithic Pentaho Scheduler into a microservices architecture involves decomposing the system into independently deployable services that communicate through well-defined APIs. This migration enables better scalability, fault isolation, and technology diversity.

#### 14.1.1 Migration Phases
```
Phase 1: Preparation & Analysis (2-3 months)
├── Domain Boundary Analysis
├── Data Dependencies Mapping
├── API Contract Definition
├── Infrastructure Setup
└── Pilot Service Selection

Phase 2: Core Services Extraction (4-6 months)
├── Job Management Service
├── Scheduler Engine Service
├── Execution Engine Service
├── User Management Service
└── Gateway Implementation

Phase 3: Supporting Services (3-4 months)
├── Notification Service
├── Audit Service
├── Content Management Service
├── Metrics & Monitoring Service
└── Configuration Service

Phase 4: Legacy System Retirement (2-3 months)
├── Data Migration Completion
├── Traffic Routing Completion
├── Legacy System Shutdown
└── Performance Optimization
```

### 14.2 Microservices Architecture Design

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Pentaho Scheduler Microservices                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Client Layer                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────────────────────┐│
│  │   Web UI     │ │   Mobile     │ │        External Applications            ││
│  │   (React)    │ │    Apps      │ │                                         ││
│  └──────────────┘ └──────────────┘ └─────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────────────┤
│  API Gateway Layer                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                     Kong / Zuul / Spring Cloud Gateway                     ││
│  │  - Authentication    - Rate Limiting    - Load Balancing                   ││
│  │  - Authorization     - Circuit Breaker  - Request Routing                  ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────────────┤
│  Core Scheduler Services                                                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐│
│  │   Job Mgmt      │ │  Scheduler      │ │   Execution     │ │   Trigger     ││
│  │   Service       │ │   Engine        │ │   Engine        │ │   Service     ││
│  │                 │ │   Service       │ │   Service       │ │               ││
│  │ - CRUD Ops      │ │ - Scheduling    │ │ - Job Execution │ │ - Cron Parser ││
│  │ - Validation    │ │ - State Mgmt    │ │ - Monitoring    │ │ - Trigger Mgmt││
│  │ - Metadata      │ │ - Clustering    │ │ - Results       │ │ - Blockouts   ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ └───────────────┘│
├─────────────────────────────────────────────────────────────────────────────────┤
│  Supporting Services                                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐│
│  │    User     │ │Notification │ │   Content   │ │   Audit     │ │ Config    ││
│  │   Service   │ │  Service    │ │   Service   │ │  Service    │ │ Service   ││
│  │             │ │             │ │             │ │             │ │           ││
│  │- Auth       │ │- Email      │ │- File Mgmt  │ │- Logging    │ │- Settings ││
│  │- Permissions│ │- SMS        │ │- Templates  │ │- Compliance │ │- Defaults ││
│  │- Profiles   │ │- Webhooks   │ │- Repository │ │- Analytics  │ │- Features ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘│
├─────────────────────────────────────────────────────────────────────────────────┤
│  Data Layer                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐│
│  │    Jobs     │ │ Executions  │ │    Users    │ │   Content   │ │  Config   ││
│  │  Database   │ │  Database   │ │  Database   │ │   Store     │ │   Store   ││
│  │ (PostgreSQL)│ │(Time Series)│ │ (PostgreSQL)│ │   (S3/GCS)  │ │ (etcd)    ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘│
├─────────────────────────────────────────────────────────────────────────────────┤
│  Infrastructure Services                                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐│
│  │  Service    │ │   Message   │ │  Monitoring │ │   Logging   │ │  Security ││
│  │  Discovery  │ │    Queue    │ │   (Prom/    │ │  (ELK/      │ │  (Vault/  ││
│  │ (Consul/    │ │  (Kafka/    │ │  Grafana)   │ │  Fluentd)   │ │  Keycloak)││
│  │  Eureka)    │ │   RabbitMQ) │ │             │ │             │ │           ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Service Decomposition Strategy

#### 14.3.1 Job Management Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: job-management-service
spec:
  responsibilities:
    - Job CRUD operations
    - Job validation and metadata management
    - Job versioning and templates
    - Job dependency management
  
  technology_stack:
    framework: Spring Boot 3.x
    database: PostgreSQL
    cache: Redis
    messaging: Apache Kafka
  
  api_endpoints:
    - POST /api/v1/jobs
    - GET /api/v1/jobs/{id}
    - PUT /api/v1/jobs/{id}
    - DELETE /api/v1/jobs/{id}
    - GET /api/v1/jobs/{id}/versions
    - POST /api/v1/jobs/{id}/clone
  
  database_schema:
    tables:
      - jobs
      - job_parameters
      - job_versions
      - job_templates
      - job_dependencies
```

**Implementation Example:**
```java
@RestController
@RequestMapping("/api/v1/jobs")
public class JobManagementController {
    
    private final JobService jobService;
    private final JobValidationService validationService;
    private final EventPublisher eventPublisher;
    
    @PostMapping
    public ResponseEntity<JobResponse> createJob(@Valid @RequestBody CreateJobRequest request) {
        // Validate job configuration
        ValidationResult validation = validationService.validate(request);
        if (!validation.isValid()) {
            return ResponseEntity.badRequest()
                .body(JobResponse.error(validation.getErrors()));
        }
        
        // Create job
        Job job = jobService.createJob(request);
        
        // Publish event for other services
        eventPublisher.publishEvent(new JobCreatedEvent(job.getId(), job.getName()));
        
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(JobResponse.success(job));
    }
    
    @GetMapping("/{jobId}")
    public ResponseEntity<JobResponse> getJob(@PathVariable String jobId) {
        return jobService.findById(jobId)
            .map(job -> ResponseEntity.ok(JobResponse.success(job)))
            .orElse(ResponseEntity.notFound().build());
    }
}
```

#### 14.3.2 Scheduler Engine Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: scheduler-engine-service
spec:
  responsibilities:
    - Job scheduling and trigger management
    - Scheduler state management
    - Clustering and high availability
    - Misfire handling
  
  technology_stack:
    framework: Spring Boot 3.x
    scheduler: Quartz Scheduler
    database: PostgreSQL (shared with Job Management)
    coordination: Apache Zookeeper
  
  api_endpoints:
    - POST /api/v1/scheduler/schedule
    - DELETE /api/v1/scheduler/unschedule/{jobId}
    - POST /api/v1/scheduler/pause/{jobId}
    - POST /api/v1/scheduler/resume/{jobId}
    - GET /api/v1/scheduler/status
    - POST /api/v1/scheduler/state
  
  configuration:
    cluster_mode: true
    max_threads: 50
    misfire_threshold: 60000
    check_in_interval: 20000
```

**Implementation Example:**
```java
@Service
@Transactional
public class SchedulerEngineService {
    
    private final Scheduler quartzScheduler;
    private final JobManagementServiceClient jobClient;
    private final TriggerServiceClient triggerClient;
    
    public ScheduleResponse scheduleJob(ScheduleJobRequest request) {
        try {
            // Get job details from Job Management Service
            JobDetails jobDetails = jobClient.getJobDetails(request.getJobId());
            
            // Get trigger configuration from Trigger Service
            TriggerConfig triggerConfig = triggerClient.buildTrigger(request.getTriggerSpec());
            
            // Create Quartz JobDetail and Trigger
            JobDetail jobDetail = buildJobDetail(jobDetails);
            Trigger trigger = buildQuartzTrigger(triggerConfig);
            
            // Schedule with Quartz
            Date scheduledTime = quartzScheduler.scheduleJob(jobDetail, trigger);
            
            return ScheduleResponse.builder()
                .jobId(request.getJobId())
                .nextFireTime(scheduledTime)
                .status("SCHEDULED")
                .build();
                
        } catch (Exception e) {
            log.error("Failed to schedule job: {}", request.getJobId(), e);
            return ScheduleResponse.error(e.getMessage());
        }
    }
}
```

#### 14.3.3 Execution Engine Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: execution-engine-service
spec:
  responsibilities:
    - Job execution orchestration
    - Resource management and scaling
    - Execution monitoring and reporting
    - Failure handling and retries
  
  technology_stack:
    framework: Spring Boot 3.x
    execution: Docker containers
    orchestration: Kubernetes Jobs
    monitoring: Micrometer + Prometheus
  
  api_endpoints:
    - POST /api/v1/executions/execute
    - GET /api/v1/executions/{executionId}
    - POST /api/v1/executions/{executionId}/cancel
    - GET /api/v1/executions/{executionId}/logs
    - GET /api/v1/executions/history/{jobId}
  
  scaling_config:
    min_replicas: 2
    max_replicas: 20
    cpu_threshold: 70
    memory_threshold: 80
```

**Implementation Example:**
```java
@Component
public class JobExecutionOrchestrator {
    
    private final KubernetesJobClient k8sClient;
    private final ExecutionContextBuilder contextBuilder;
    private final NotificationServiceClient notificationClient;
    
    @EventListener
    @Async
    public void handleJobTriggerEvent(JobTriggerEvent event) {
        try {
            // Build execution context
            ExecutionContext context = contextBuilder.build(event.getJobId());
            
            // Create Kubernetes Job for execution
            KubernetesJob k8sJob = K8sJobBuilder.builder()
                .withJobId(event.getJobId())
                .withExecutionId(context.getExecutionId())
                .withResources(context.getResourceRequirements())
                .withEnvironment(context.getEnvironmentVariables())
                .build();
            
            // Submit to Kubernetes
            JobExecution execution = k8sClient.submitJob(k8sJob);
            
            // Start monitoring
            monitoringService.startMonitoring(execution);
            
        } catch (Exception e) {
            log.error("Failed to orchestrate job execution: {}", event.getJobId(), e);
            notificationClient.sendFailureNotification(event.getJobId(), e.getMessage());
        }
    }
}
```

### 14.4 Data Migration Strategy

#### 14.4.1 Database Decomposition
```sql
-- Original Monolithic Database
-- pentaho_scheduler_db

-- Decomposed Databases:

-- 1. Job Management Database
CREATE DATABASE job_management_db;
CREATE TABLE jobs (
    job_id VARCHAR(255) PRIMARY KEY,
    job_name VARCHAR(255) NOT NULL,
    description TEXT,
    action_class VARCHAR(255),
    input_file VARCHAR(500),
    output_file VARCHAR(500),
    created_by VARCHAR(255),
    created_time TIMESTAMP,
    modified_time TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- 2. Execution Database (Time Series)
CREATE DATABASE execution_db;
CREATE TABLE executions (
    execution_id VARCHAR(255) PRIMARY KEY,
    job_id VARCHAR(255),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(50),
    result TEXT,
    error_message TEXT,
    resource_usage JSONB,
    created_time TIMESTAMP
) PARTITION BY RANGE (created_time);

-- 3. User Management Database
CREATE DATABASE user_management_db;
CREATE TABLE users (
    user_id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    email VARCHAR(255),
    roles TEXT[],
    permissions JSONB,
    created_time TIMESTAMP
);
```

#### 14.4.2 Data Migration Scripts
```python
# Migration Script Example
import asyncio
import asyncpg
from datetime import datetime

class DatabaseMigrator:
    def __init__(self):
        self.source_conn = None
        self.target_connections = {}
    
    async def migrate_jobs_data(self):
        """Migrate job data from monolithic to job management service"""
        async with self.source_conn.transaction():
            async for record in self.source_conn.cursor(
                "SELECT * FROM qrtz_pentaho_jobs ORDER BY created_time"
            ):
                # Transform data for new schema
                job_data = {
                    'job_id': record['job_id'],
                    'job_name': record['job_name'],
                    'description': record['description'],
                    'action_class': record['action_class'],
                    'input_file': record['input_file'],
                    'output_file': record['output_file'],
                    'created_by': record['user_name'],
                    'created_time': record['created_time'],
                    'modified_time': record['modified_time'],
                    'version': 1
                }
                
                # Insert into job management database
                await self.target_connections['job_mgmt'].execute(
                    """INSERT INTO jobs (job_id, job_name, description, action_class, 
                       input_file, output_file, created_by, created_time, modified_time, version)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)""",
                    *job_data.values()
                )
                
                print(f"Migrated job: {record['job_id']}")
    
    async def migrate_execution_history(self):
        """Migrate execution history to time series database"""
        batch_size = 1000
        offset = 0
        
        while True:
            records = await self.source_conn.fetch(
                """SELECT * FROM qrtz_pentaho_executions 
                   ORDER BY start_time LIMIT $1 OFFSET $2""",
                batch_size, offset
            )
            
            if not records:
                break
            
            # Batch insert into execution database
            execution_data = [
                (r['execution_id'], r['job_id'], r['start_time'], 
                 r['end_time'], r['status'], r['result'], r['error_message'],
                 {'lines_read': r['lines_read'], 'lines_written': r['lines_written']},
                 r['start_time'])
                for r in records
            ]
            
            await self.target_connections['execution'].executemany(
                """INSERT INTO executions (execution_id, job_id, start_time, end_time,
                   status, result, error_message, resource_usage, created_time)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
                execution_data
            )
            
            offset += batch_size
            print(f"Migrated {offset} execution records")
```

### 14.5 Inter-Service Communication

#### 14.5.1 Synchronous Communication (REST APIs)
```java
// Service Client with Circuit Breaker
@Component
public class JobManagementServiceClient {
    
    private final WebClient webClient;
    private final CircuitBreaker circuitBreaker;
    
    public JobManagementServiceClient(WebClient.Builder webClientBuilder) {
        this.webClient = webClientBuilder
            .baseUrl("http://job-management-service")
            .build();
        
        this.circuitBreaker = CircuitBreaker.ofDefaults("job-management-service");
    }
    
    public Mono<JobDetails> getJobDetails(String jobId) {
        return circuitBreaker.executeSupplier(() ->
            webClient.get()
                .uri("/api/v1/jobs/{jobId}", jobId)
                .retrieve()
                .bodyToMono(JobDetails.class)
                .timeout(Duration.ofSeconds(5))
        );
    }
}
```

#### 14.5.2 Asynchronous Communication (Message Queues)
```java
// Event Publishing
@Component
public class JobEventPublisher {
    
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    @EventListener
    public void handleJobCreated(JobCreatedEvent event) {
        JobCreatedMessage message = JobCreatedMessage.builder()
            .jobId(event.getJobId())
            .jobName(event.getJobName())
            .createdBy(event.getCreatedBy())
            .timestamp(Instant.now())
            .build();
        
        kafkaTemplate.send("job-events", event.getJobId(), message);
    }
}

// Event Consumption
@KafkaListener(topics = "job-events")
@Component
public class SchedulerEventHandler {
    
    private final SchedulerEngineService schedulerService;
    
    @KafkaHandler
    public void handleJobCreated(JobCreatedMessage message) {
        log.info("Received job created event: {}", message.getJobId());
        // Update scheduler state, prepare for scheduling
        schedulerService.prepareJobForScheduling(message.getJobId());
    }
    
    @KafkaHandler
    public void handleJobUpdated(JobUpdatedMessage message) {
        log.info("Received job updated event: {}", message.getJobId());
        // Reschedule if necessary
        schedulerService.rescheduleIfNeeded(message.getJobId());
    }
}
```

### 14.6 Service Mesh and Infrastructure

#### 14.6.1 Istio Service Mesh Configuration
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: scheduler-services
spec:
  hosts:
  - scheduler.pentaho.com
  gateways:
  - scheduler-gateway
  http:
  - match:
    - uri:
        prefix: /api/v1/jobs
    route:
    - destination:
        host: job-management-service
        port:
          number: 8080
      weight: 100
    fault:
      delay:
        percentage:
          value: 0.1
        fixedDelay: 5s
    retries:
      attempts: 3
      perTryTimeout: 10s
  
  - match:
    - uri:
        prefix: /api/v1/scheduler
    route:
    - destination:
        host: scheduler-engine-service
        port:
          number: 8080
      weight: 100
    
  - match:
    - uri:
        prefix: /api/v1/executions
    route:
    - destination:
        host: execution-engine-service
        port:
          number: 8080
      weight: 100
```

#### 14.6.2 Kubernetes Deployment Configuration
```yaml
# Job Management Service Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: job-management-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: job-management-service
  template:
    metadata:
      labels:
        app: job-management-service
    spec:
      containers:
      - name: job-management
        image: pentaho/job-management-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "kubernetes"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: job-mgmt-db-secret
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /actuator/health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: job-management-service
spec:
  selector:
    app: job-management-service
  ports:
  - port: 8080
    targetPort: 8080
  type: ClusterIP
```

### 14.7 Migration Timeline and Phases

#### 14.7.1 Phase 1: Foundation Setup (Months 1-3)
```yaml
phase_1_deliverables:
  infrastructure:
    - Kubernetes cluster setup
    - Service mesh installation (Istio)
    - CI/CD pipeline configuration
    - Monitoring stack (Prometheus/Grafana)
    - Logging stack (ELK)
  
  development:
    - API contract definitions (OpenAPI 3.0)
    - Service templates and scaffolding
    - Database design for each service
    - Security framework setup
  
  pilot_service:
    - Extract User Management Service
    - Implement authentication/authorization
    - Test integration with existing system
  
  success_criteria:
    - User authentication works through new service
    - Performance matches existing system
    - Zero downtime deployment achieved
```

#### 14.7.2 Phase 2: Core Services (Months 4-9)
```yaml
phase_2_deliverables:
  services:
    - Job Management Service
    - Scheduler Engine Service  
    - Execution Engine Service
    - API Gateway implementation
  
  data_migration:
    - Job data migration scripts
    - Execution history migration
    - Data consistency validation
  
  integration:
    - Event-driven communication
    - Circuit breaker implementation
    - Service discovery setup
  
  testing:
    - End-to-end testing framework
    - Performance testing
    - Chaos engineering setup
  
  success_criteria:
    - 50% of traffic routed through microservices
    - Performance within 10% of baseline
    - No data loss during migration
```

### 14.8 Monitoring and Observability

#### 14.8.1 Distributed Tracing
```java
@RestController
public class JobController {
    
    @Autowired
    private Tracer tracer;
    
    @PostMapping("/jobs")
    public ResponseEntity<Job> createJob(@RequestBody CreateJobRequest request) {
        Span span = tracer.nextSpan()
            .name("job-creation")
            .tag("job.type", request.getActionClass())
            .start();
        
        try (Tracer.SpanInScope ws = tracer.withSpanInScope(span)) {
            // Service logic
            Job job = jobService.createJob(request);
            span.tag("job.id", job.getId());
            return ResponseEntity.ok(job);
        } finally {
            span.end();
        }
    }
}
```

#### 14.8.2 Service Health Monitoring
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    
    rule_files:
      - "scheduler_rules.yml"
    
    scrape_configs:
      - job_name: 'job-management-service'
        static_configs:
          - targets: ['job-management-service:8080']
        metrics_path: '/actuator/prometheus'
      
      - job_name: 'scheduler-engine-service'
        static_configs:
          - targets: ['scheduler-engine-service:8080']
        metrics_path: '/actuator/prometheus'
      
      - job_name: 'execution-engine-service'
        static_configs:
          - targets: ['execution-engine-service:8080']
        metrics_path: '/actuator/prometheus'
    
    alerting:
      alertmanagers:
        - static_configs:
            - targets:
              - alertmanager:9093
```

### 14.9 Security Considerations

#### 14.9.1 Service-to-Service Authentication
```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt
                    .jwtAuthenticationConverter(jwtAuthenticationConverter())
                )
            )
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/api/v1/jobs/**").hasRole("SCHEDULER_USER")
                .requestMatchers("/api/v1/admin/**").hasRole("SCHEDULER_ADMIN")
                .anyRequest().authenticated()
            );
        
        return http.build();
    }
    
    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            // Extract roles from JWT claims
            List<String> roles = jwt.getClaimAsStringList("roles");
            return roles.stream()
                .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                .collect(Collectors.toList());
        });
        return converter;
    }
}
```

### 14.10 Rollback Strategy

#### 14.10.1 Traffic Routing Rollback
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: scheduler-rollback
spec:
  hosts:
  - scheduler.pentaho.com
  http:
  - match:
    - headers:
        canary:
          exact: "true"
    route:
    - destination:
        host: scheduler-microservices
      weight: 100
  
  - route:
    - destination:
        host: scheduler-monolith
      weight: 100  # Route 100% to monolith during rollback
    - destination:
        host: scheduler-microservices
      weight: 0    # Route 0% to microservices during rollback
```

#### 14.10.2 Data Rollback Procedures
```python
class RollbackManager:
    """Manages rollback procedures for microservices migration"""
    
    def __init__(self):
        self.snapshot_manager = SnapshotManager()
        self.traffic_manager = TrafficManager()
    
    async def execute_rollback(self, rollback_point: str):
        """Execute full rollback to specified point"""
        try:
            # 1. Route traffic back to monolith
            await self.traffic_manager.route_to_monolith()
            
            # 2. Restore database snapshots
            await self.snapshot_manager.restore_snapshot(rollback_point)
            
            # 3. Verify data consistency
            consistency_check = await self.verify_data_consistency()
            if not consistency_check.is_valid():
                raise RollbackException("Data consistency check failed")
            
            # 4. Update DNS to point to monolith
            await self.traffic_manager.update_dns_to_monolith()
            
            return RollbackResult.success()
            
        except Exception as e:
            logger.error(f"Rollback failed: {e}")
            return RollbackResult.failure(str(e))
```

This comprehensive microservices migration plan provides a structured approach to decomposing the monolithic Pentaho Scheduler into independently deployable services while maintaining system reliability and performance throughout the transition.

This high-level design provides a comprehensive blueprint for implementing and maintaining the Pentaho Scheduler component, ensuring scalability, security, and enterprise-grade functionality.
