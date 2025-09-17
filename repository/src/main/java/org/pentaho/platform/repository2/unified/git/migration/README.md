# Pentaho Repository Migration Framework

A comprehensive framework for migrating repository data from existing Pentaho repository implementations (JCR/Jackrabbit, FileSystem) to the new Git-based repository system.

## Overview

This migration framework provides:

- **Complete repository content migration** - Files, folders, metadata, ACLs, and version history
- **Multiple source support** - JCR/Jackrabbit, FileSystem, and any IUnifiedRepository implementation
- **Git-based target** - Leverages Git's superior version control and branching capabilities
- **Flexible configuration** - Multiple migration strategies for different scenarios
- **Progress monitoring** - Real-time progress tracking and statistics
- **Validation and rollback** - Comprehensive validation with rollback capabilities
- **Production-ready tools** - Command-line tools and Spring integration

## Architecture

### Core Components

1. **UnifiedRepositoryMigrationService** - Main migration orchestrator
2. **MigrationConfiguration** - Configuration options for migration behavior
3. **MigrationPlan** - Optimized migration ordering and dependency resolution
4. **MigrationStatistics** - Real-time progress tracking and reporting
5. **MigrationTool** - Command-line interface for migration operations

### Migration Flow

```
Source Repository → Migration Plan → Git Repository
       ↓                    ↓              ↓
   [Validation]     [Optimization]   [Validation]
       ↓                    ↓              ↓
   [ACL Export]      [Batch Processing] [Git Commits]
       ↓                    ↓              ↓
   [Metadata]        [Progress Tracking] [Branch Management]
```

## Quick Start

### 1. Command Line Migration

```bash
# Basic migration
./migrate-repository.sh \
  --source-config repository-jcr.spring.xml \
  --target-git-dir /opt/pentaho/git-repo \
  --validate

# Interactive migration
./migrate-repository.sh

# Production migration with full safety
./migrate-repository.sh \
  --source-config repository-jcr.spring.xml \
  --target-git-dir /opt/pentaho/git-repo \
  --profile production \
  --continue-on-error \
  --validate
```

### 2. Programmatic Migration

```java
// Setup repositories
IUnifiedRepository sourceRepository = getJcrRepository();
GitUnifiedRepository targetRepository = new GitUnifiedRepository(new File("/opt/pentaho/git-repo"));

// Configure migration
MigrationConfiguration config = new MigrationConfiguration();
config.setMigrateAcls(true);
config.setMigrateMetadata(true);
config.setMigrateVersionHistory(true);
config.setValidateAfterMigration(true);

// Create and run migration
UnifiedRepositoryMigrationService migration = 
    new UnifiedRepositoryMigrationService(sourceRepository, targetRepository, config);

MigrationResult result = migration.migrateRepository();

if (result.isSuccessful()) {
    System.out.println("Migration completed: " + result.getStatistics());
} else {
    System.err.println("Migration failed: " + result.getError().getMessage());
}
```

### 3. Spring Integration

```xml
<!-- Load migration configuration -->
<import resource="classpath:repository-migration.spring.xml" />

<!-- Use migration service -->
<bean id="myMigration" ref="migrationService" />
```

```java
@Autowired
@Qualifier("productionMigrationService")
private UnifiedRepositoryMigrationService migrationService;

public void performMigration() {
    MigrationResult result = migrationService.migrateRepository();
    // Handle result...
}
```

## Migration Configurations

### Default Configuration
- Migrates ACLs, metadata, and version history
- Continues on individual item errors
- Validates after migration
- Batch size: 100 items
- Progress reporting every 50 items

### Fast Configuration
- Skips ACLs and version history
- Larger batch sizes for performance
- Minimal validation
- Suitable for development/testing

### Production Configuration
- Full migration with all data
- Stops on any error
- Comprehensive validation
- Rollback on failure
- Creates migration branch
- Smaller batch sizes for safety

### JCR-Specific Configuration
- Optimized for JCR/Jackrabbit sources
- Preserves all JCR metadata
- Handles JCR versioning
- ACL translation for Git storage

### FileSystem-Specific Configuration
- Optimized for FileSystem sources
- Skips ACLs (not typically available)
- No version history migration
- Faster processing

## Command Line Tool

The migration tool provides a comprehensive command-line interface:

### Options

```
--source-config <file>      Source repository Spring configuration
--target-git-dir <dir>      Target Git repository directory
--source-path <path>        Path to migrate (default: /)
--target-branch <branch>    Target Git branch
--batch-size <size>         Batch commit size
--no-acls                   Skip ACL migration
--no-metadata               Skip metadata migration
--no-versions               Skip version history migration
--continue-on-error         Continue on individual errors
--validate                  Validate after migration
--dry-run                   Show what would be migrated
--verbose                   Detailed progress information
--quiet                     Suppress progress output
--profile <profile>         Spring profile (jcr-migration, filesystem-migration)
```

### Examples

```bash
# Full repository migration
./migrate-repository.sh \
  --source-config /opt/pentaho/repository-jcr.spring.xml \
  --target-git-dir /opt/pentaho/git-repo \
  --validate \
  --continue-on-error

# Migrate specific folder
./migrate-repository.sh \
  --source-config /opt/pentaho/repository-jcr.spring.xml \
  --target-git-dir /opt/pentaho/git-repo \
  --source-path /public \
  --no-versions

# Fast migration for testing
./migrate-repository.sh \
  --source-config /opt/pentaho/repository-jcr.spring.xml \
  --target-git-dir /opt/pentaho/git-repo \
  --no-acls \
  --no-metadata \
  --no-versions \
  --batch-size 200

# Dry run to see what would be migrated
./migrate-repository.sh \
  --source-config /opt/pentaho/repository-jcr.spring.xml \
  --target-git-dir /opt/pentaho/git-repo \
  --dry-run \
  --verbose
```

## Migration Process

### Phase 1: Pre-Migration Validation
- Validate source repository connectivity
- Verify target Git repository
- Check write permissions
- Validate configuration

### Phase 2: Migration Planning
- Scan source repository structure
- Build optimal migration order (folders before files)
- Calculate estimated time and resources
- Create migration plan

### Phase 3: Data Migration
- Create target branch (if specified)
- Migrate folders (create directory structure)
- Migrate files (content, metadata, ACLs)
- Migrate version history (if enabled)
- Batch commit based on configuration

### Phase 4: Post-Migration Validation
- Verify all items migrated correctly
- Validate file content integrity
- Check ACL preservation
- Confirm metadata transfer

### Phase 5: Finalization
- Merge migration branch (if applicable)
- Generate migration report
- Cleanup temporary resources

## Monitoring and Statistics

The migration framework provides comprehensive monitoring:

### Statistics Tracked
- Items processed (folders, files)
- Data volume migrated
- ACLs and metadata migrated
- Version history items
- Error counts by type
- Processing rate (items/second)
- Time elapsed and estimated completion

### Progress Events
- Migration started/completed/failed
- Progress updates (configurable interval)
- Individual item migration
- Error notifications

### Example Monitoring

```java
migrationService.addMigrationListener(new MigrationListener() {
    @Override
    public void onMigrationEvent(MigrationEvent event, Object data) {
        switch (event) {
            case PROGRESS_UPDATE:
                MigrationStatistics stats = (MigrationStatistics) data;
                logger.info("Progress: {} items, {} errors, {:.1f} items/sec",
                           stats.getProcessedItems(), 
                           stats.getTotalErrors(),
                           stats.getItemsPerSecond());
                break;
            // Handle other events...
        }
    }
});
```

## Error Handling and Recovery

### Error Handling Strategies
1. **Stop on Error** - Halt migration on any error
2. **Continue on Error** - Log errors but continue migration
3. **Rollback on Failure** - Automatically rollback on critical failures

### Recovery Options
- Restart from last successful batch
- Resume migration from specific point
- Rollback to pre-migration state
- Manual cleanup and retry

### Error Types Tracked
- Source repository access errors
- Target repository write errors
- ACL migration errors
- Metadata migration errors
- Version history errors
- Validation errors

## Configuration Files

### Migration Properties (`migration.properties`)
```properties
# Repository paths
git.repository.path=/opt/pentaho/repositories/git-repo
git.repository.branch=main

# Migration behavior
migration.acls.enabled=true
migration.metadata.enabled=true
migration.version.history.enabled=true
migration.continue.on.error=true
migration.validate.after.migration=true

# Performance settings
migration.batch.commit.size=100
migration.progress.report.interval=50
```

### Spring Configuration (`repository-migration.spring.xml`)
Complete Spring configuration with multiple profiles:
- `development` - Fast migration for development
- `testing` - Default migration with validation
- `production` - Full migration with rollback
- `jcr-migration` - JCR-specific configuration
- `filesystem-migration` - FileSystem-specific configuration

## Best Practices

### Pre-Migration
1. **Backup source repository** - Always backup before migration
2. **Test migration** - Run on test data first
3. **Verify Git repository** - Ensure target is properly initialized
4. **Check disk space** - Ensure adequate space for Git repository
5. **Plan downtime** - Schedule migration during maintenance window

### During Migration
1. **Monitor progress** - Watch for errors and performance issues
2. **Check logs** - Monitor migration logs for warnings
3. **Verify resources** - Ensure adequate memory and CPU
4. **Network stability** - Ensure stable network for large migrations

### Post-Migration
1. **Validate results** - Run validation checks
2. **Test functionality** - Verify repository operations work
3. **Performance testing** - Check Git repository performance
4. **Update configurations** - Switch applications to Git repository
5. **Archive old repository** - Safely archive source repository

### Performance Optimization
- **Batch size tuning** - Adjust based on available memory
- **Concurrent operations** - Use multiple threads for large migrations
- **Network optimization** - Use local Git repositories when possible
- **Memory management** - Monitor and adjust JVM settings

## Troubleshooting

### Common Issues

**OutOfMemoryError during migration**
```bash
# Increase JVM heap size
export MIGRATION_HEAP_SIZE=4g
./migrate-repository.sh ...
```

**Git repository initialization**
```bash
# Initialize target Git repository
cd /opt/pentaho/git-repo
git init
git config user.name "Migration Service"
git config user.email "migration@pentaho.com"
```

**Permission errors**
```bash
# Ensure proper permissions
chmod -R 755 /opt/pentaho/git-repo
chown -R pentaho:pentaho /opt/pentaho/git-repo
```

**Large file handling**
```bash
# Configure Git for large files
cd /opt/pentaho/git-repo
git lfs track "*.jar"
git lfs track "*.war"
git add .gitattributes
```

### Debug Mode
```bash
# Enable debug logging
./migrate-repository.sh \
  --verbose \
  --source-config ... \
  --target-git-dir ...
```

### Log Analysis
```bash
# Check migration logs
tail -f /var/log/pentaho/migration.log

# Search for errors
grep -i error /var/log/pentaho/migration.log

# Count migrated items
grep "Successfully migrated" /var/log/pentaho/migration.log | wc -l
```

## Migration Examples

See `MigrationExamples.java` for complete code examples including:

1. **Basic JCR to Git migration**
2. **FileSystem to Git migration**
3. **Selective folder migration**
4. **Production migration with full safety**
5. **Custom filtering and validation**

## Integration

### Pentaho Platform Integration
The Git repository can be used as a drop-in replacement for existing repository implementations:

```xml
<!-- Replace existing repository bean -->
<bean id="unifiedRepository" 
      class="org.pentaho.platform.repository2.unified.git.GitUnifiedRepository">
  <constructor-arg value="/opt/pentaho/git-repo" />
</bean>
```

### Custom Repository Implementations
The migration framework can migrate from any `IUnifiedRepository` implementation:

```java
// Custom repository migration
public class CustomRepositoryMigration {
    public void migrate(IUnifiedRepository customRepo) {
        GitUnifiedRepository gitRepo = new GitUnifiedRepository(gitDir);
        UnifiedRepositoryMigrationService migration = 
            new UnifiedRepositoryMigrationService(customRepo, gitRepo);
        migration.migrateRepository();
    }
}
```

## Support and Maintenance

### Version Compatibility
- Java 8+ required
- Spring Framework 4.0+
- JGit 4.5+
- Compatible with all Pentaho Platform versions

### Logging Configuration
The migration framework uses SLF4J for logging. Configure your logging framework:

```xml
<!-- Log4j configuration -->
<logger name="org.pentaho.platform.repository2.unified.git.migration" level="INFO" />
```

### Monitoring Integration
The framework provides JMX beans for monitoring:
- `MigrationStatisticsMBean` - Real-time statistics
- `MigrationEventPublisher` - Event publishing for external monitoring

---

For additional support, examples, and advanced configuration options, see the source code and JavaDoc documentation.
