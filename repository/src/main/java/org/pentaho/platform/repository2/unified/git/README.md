# Git-Based Pentaho Repository Implementation

## Overview

This is a comprehensive Git-based implementation of the Pentaho Unified Repository that provides distributed version control capabilities for Pentaho repository operations. It follows the same architectural patterns as the existing `DefaultUnifiedRepository` but uses Git as the underlying storage mechanism.

## Architecture

### Design Patterns

The implementation follows the **Delegation Pattern** used by `DefaultUnifiedRepository`:

```
GitUnifiedRepository
├── GitRepositoryFileDao (IRepositoryFileDao)
└── GitRepositoryFileAclDao (IRepositoryFileAclDao)
```

### Key Components

1. **GitRepositoryFileDao**: Handles file/folder CRUD operations using JGit
2. **GitRepositoryFileAclDao**: Manages Access Control Lists stored as JSON in Git
3. **GitUnifiedRepository**: Main repository interface that delegates to the DAOs

## Features

### Core Capabilities

- ✅ **Full Git Version Control**: Every repository operation creates Git commits with history
- ✅ **Branch Support**: Create and switch between branches for isolation and parallel development
- ✅ **Distributed Repository**: Clone, push, pull capabilities through Git
- ✅ **Human-Readable Storage**: Files stored in original format, ACLs as JSON
- ✅ **Git Tooling Integration**: Compatible with standard Git tools and workflows
- ✅ **Atomic Operations**: Git's transactional nature ensures consistency

### Advanced Features

- 🔄 **Branch-based Development**: Isolate changes in feature branches
- 📦 **Git-native Backup**: Backup through Git remotes (push/pull)
- 🔍 **Version History**: Complete commit history for all repository changes
- 🌐 **Distributed Teams**: Multiple developers can work on repository content
- 🛠️ **Git Workflows**: Support for Git branching strategies (GitFlow, etc.)

## Implementation Details

### File Storage

```
repository-git/
├── .git/                          # Git metadata
├── .pentaho/                      # Pentaho-specific metadata
│   ├── acls/                      # ACL storage (.acl files)
│   ├── metadata/                  # File metadata
│   └── versions/                  # Version-specific data
├── public/                        # Public repository content
├── home/                          # User home directories
└── etc/                           # System configurations
```

### ACL Storage

ACLs are stored as JSON files in the `.pentaho/acls/` directory:

```json
{
  "id": "/public/reports/sales.prpt",
  "owner": {
    "name": "admin",
    "type": "USER"
  },
  "entriesInheriting": true,
  "aces": [
    {
      "sid": {
        "name": "administrators",
        "type": "ROLE"
      },
      "permissions": ["READ", "WRITE", "DELETE", "ACL_MANAGEMENT"]
    }
  ]
}
```

## Installation & Configuration

### Maven Dependencies

Add to your `pom.xml`:

```xml
<dependency>
    <groupId>org.eclipse.jgit</groupId>
    <artifactId>org.eclipse.jgit</artifactId>
    <version>6.7.0.202309050840-r</version>
</dependency>
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
    <version>2.15.2</version>
</dependency>
```

### Spring Configuration

Replace the existing repository configuration with:

```xml
<!-- Import Git repository configuration -->
<import resource="repository-git.spring.xml" />

<!-- Or configure manually -->
<bean id="gitUnifiedRepository" 
      class="org.pentaho.platform.repository2.unified.git.GitUnifiedRepository">
  <constructor-arg value="/opt/pentaho/repository-git" />
</bean>

<alias name="gitUnifiedRepository" alias="unifiedRepository" />
```

### Environment Properties

Configure through system properties or `application.properties`:

```properties
# Git repository location
pentaho.repository.git.path=/opt/pentaho/repository-git

# Git author information
pentaho.repository.git.author.name=Pentaho System
pentaho.repository.git.author.email=system@pentaho.com

# Default branch
pentaho.repository.git.branch=main

# Enable automatic commits
pentaho.repository.git.autocommit=true
```

## Usage Examples

### Basic Repository Operations

```java
// Initialize Git repository
GitUnifiedRepository repository = new GitUnifiedRepository("/path/to/git/repo");

// Create file (automatically commits to Git)
RepositoryFile file = new RepositoryFile.Builder("report.prpt").build();
SimpleRepositoryFileData data = new SimpleRepositoryFileData(
    new ByteArrayInputStream("content".getBytes()), "UTF-8", "text/plain"
);
RepositoryFile createdFile = repository.createFile(
    "/public", file, data, "Added new report"
);

// Read file
SimpleRepositoryFileData retrievedData = repository.getDataForRead(
    createdFile.getId(), SimpleRepositoryFileData.class
);
```

### Branch Operations

```java
GitUnifiedRepository gitRepo = (GitUnifiedRepository) repository;

// Create feature branch
gitRepo.createBranch("feature/new-dashboard");

// Switch to feature branch
gitRepo.switchBranch("feature/new-dashboard");

// Work on feature branch
RepositoryFile dashboard = repository.createFile(
    "/public/dashboards", 
    new RepositoryFile.Builder("sales-dashboard.xml").build(),
    dashboardData,
    "Add sales dashboard"
);

// Switch back to main
gitRepo.switchBranch("main");
```

### Version History

```java
// Get version history for a file
List<VersionSummary> versions = repository.getVersionSummaries(fileId);

for (VersionSummary version : versions) {
    System.out.println("Version: " + version.getId());
    System.out.println("Message: " + version.getMessage());
    System.out.println("Author: " + version.getAuthor());
    System.out.println("Date: " + version.getDate());
}

// Get specific version
RepositoryFile oldVersion = repository.getFileAtVersion(fileId, versionId);
```

### ACL Management

```java
// Create ACL
RepositoryFileSid userSid = new RepositoryFileSid("john", RepositoryFileSid.Type.USER);
RepositoryFileSid adminRole = new RepositoryFileSid("administrators", RepositoryFileSid.Type.ROLE);

RepositoryFileAcl acl = new RepositoryFileAcl.Builder(fileId, userSid)
    .ace(new RepositoryFileAce(adminRole, EnumSet.of(
        RepositoryFilePermission.READ,
        RepositoryFilePermission.WRITE,
        RepositoryFilePermission.DELETE
    )))
    .entriesInheriting(true)
    .build();

// Apply ACL
repository.updateAcl(acl);
```

## Migration from JCR

### Automated Migration

Use the provided migration service:

```java
JcrToGitMigrationService migrationService = new JcrToGitMigrationService(
    jcrRepository,    // Source JCR repository
    gitRepository     // Target Git repository
);

// Configure migration options
migrationService.setMigrationBatchSize(100);
migrationService.setPreserveHistory(true);

// Run migration
MigrationResult result = migrationService.migrate();
```

### Manual Migration Steps

1. **Backup existing JCR repository**
2. **Initialize Git repository**
3. **Run migration service**
4. **Verify migrated content**
5. **Update Spring configuration**
6. **Test thoroughly**

## Git Workflows

### Feature Branch Workflow

```bash
# Development team workflow
git clone /path/to/pentaho-repository.git
cd pentaho-repository

# Create feature branch
pentaho-admin create-branch feature/new-reports

# Switch to feature branch
pentaho-admin switch-branch feature/new-reports

# Work on repository content through Pentaho tools
# Changes are automatically committed to Git

# Merge feature branch (using Git tools)
git checkout main
git merge feature/new-reports
git push origin main
```

### GitFlow Integration

The implementation supports GitFlow branching strategy:

- `main`: Production-ready content
- `develop`: Integration branch
- `feature/*`: Feature development
- `release/*`: Release preparation
- `hotfix/*`: Production fixes

## Monitoring & Administration

### Repository Statistics

```java
GitRepositoryStatistics stats = new GitRepositoryStatistics(gitRepository);

System.out.println("Total files: " + stats.getTotalFiles());
System.out.println("Total commits: " + stats.getTotalCommits());
System.out.println("Repository size: " + stats.getRepositorySize());
System.out.println("Current branch: " + stats.getCurrentBranch());
```

### Health Checks

```java
GitRepositoryValidator validator = new GitRepositoryValidator(gitRepository);
List<String> issues = validator.validateRepository();

if (issues.isEmpty()) {
    System.out.println("Repository is healthy");
} else {
    System.out.println("Issues found:");
    issues.forEach(System.out::println);
}
```

### JMX Monitoring

Monitor through JMX:

```
Pentaho:type=Repository,name=GitRepository
├── CurrentBranch
├── TotalCommits
├── RepositorySize
├── LastCommitDate
└── Operations (switchBranch, validateRepository, etc.)
```

## Backup & Recovery

### Git-Native Backup

```bash
# Setup remote backup
git remote add backup ssh://backup-server/pentaho-repository.git

# Automatic backup through Git
git push backup main

# Restore from backup
git clone ssh://backup-server/pentaho-repository.git
```

### Automated Backup Service

```java
GitBackupService backupService = new GitBackupService(gitRepository);
backupService.setBackupRemoteUrl("ssh://backup-server/pentaho-repository.git");
backupService.setBackupSchedule("0 0 2 * * ?"); // Daily at 2 AM
backupService.enableAutomaticBackup();
```

## Performance Considerations

### Caching

- File metadata cached in memory
- ACL data cached separately
- Cache cleared on branch switches
- Configurable cache sizes and TTL

### Git Repository Size

- Large binary files may impact performance
- Consider Git LFS for large files
- Regular garbage collection recommended
- Monitor repository growth

### Optimization Tips

1. **Use appropriate batch sizes** for bulk operations
2. **Configure Git garbage collection** schedule
3. **Monitor repository size** and implement cleanup policies
4. **Use branches judiciously** - clean up old feature branches
5. **Consider Git LFS** for large binary content

## Troubleshooting

### Common Issues

#### Repository Corruption
```bash
# Check repository integrity
git fsck --full

# Repair if needed
git gc --aggressive --prune=now
```

#### Branch Conflicts
```java
// Reset to known good state
Git git = gitRepository.getGit();
git.reset().setMode(ResetCommand.ResetType.HARD).setRef("HEAD").call();
```

#### ACL Issues
```java
// Validate and fix ACLs
GitRepositoryValidator validator = new GitRepositoryValidator(gitRepository);
List<String> aclIssues = validator.validateAcls();
// Fix issues based on validation results
```

### Debug Logging

Enable debug logging:

```properties
log4j.logger.org.pentaho.platform.repository2.unified.git=DEBUG
log4j.logger.org.eclipse.jgit=DEBUG
```

## Best Practices

### Repository Management

1. **Use meaningful commit messages** for repository operations
2. **Create branches for major changes** or experiments
3. **Regular backup** to remote Git repositories
4. **Monitor repository size** and performance
5. **Implement ACL validation** in CI/CD pipelines

### Development Workflow

1. **Use feature branches** for development
2. **Merge through pull requests** for code review
3. **Tag releases** for easy rollback
4. **Document repository structure** and workflows
5. **Train team on Git concepts** and commands

### Security

1. **Secure Git remotes** with appropriate authentication
2. **Regular ACL audits** through validation tools
3. **Backup encryption** for sensitive repositories
4. **Access logging** and monitoring
5. **Branch protection** for production content

## Limitations

### Current Limitations

1. **File Locking**: Git doesn't support explicit file locking
2. **Large Files**: Performance may degrade with very large files
3. **Complex Merges**: Manual intervention may be needed for conflicts
4. **Learning Curve**: Team needs Git knowledge
5. **Migration Complexity**: Large repositories may require careful migration planning

### Future Enhancements

- [ ] Git LFS integration for large files
- [ ] Web-based repository browser
- [ ] Advanced conflict resolution tools
- [ ] Integration with Git hosting services (GitHub, GitLab)
- [ ] Enhanced performance optimizations
- [ ] Automated testing and validation tools

## Support

### Getting Help

1. **Check this documentation** for common scenarios
2. **Review Git documentation** for Git-specific issues
3. **Enable debug logging** for troubleshooting
4. **Use validation tools** to check repository health
5. **Consult Pentaho community** for implementation questions

### Contributing

The Git repository implementation is designed to be extensible. Areas for contribution:

- Additional Git workflow support
- Performance optimizations
- Enhanced monitoring and reporting
- Migration tools improvements
- Documentation and examples

---

## Conclusion

The Git-based Pentaho Repository implementation provides a modern, distributed approach to repository management while maintaining full compatibility with existing Pentaho applications. It combines the power of Git version control with the familiar Pentaho repository interface, enabling new workflows and capabilities for repository content management.

The implementation follows established patterns and provides a smooth migration path from existing JCR-based repositories, making it an excellent choice for organizations looking to modernize their Pentaho repository infrastructure.
